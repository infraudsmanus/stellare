import AdmZip from 'adm-zip';
import crypto from 'crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import AWS from 'aws-sdk';
import path from 'path';

const prisma = new PrismaClient();

// Configure AWS S3
const S3_BUCKET_NAME = process.env.BUCKET_URI ? process.env.BUCKET_URI.split('.')[0] : 'stellare-develop-content';
const s3 = new AWS.S3({
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

interface ProcessingResult {
    htmlContent: string | null;
    mappingJson: Prisma.JsonValue | null;
    processedFileCount: number;
    finalHtmlS3Url: string | null;
}

async function logProcessing(jobId: string, message: string, level: 'INFO' | 'ERROR' | 'WARNING' = 'INFO') {
    console.log(`[Job ${jobId}] ${level}: ${message}`);
    try {
        await prisma.processingLog.create({
            data: {
                uploadJobId: jobId,
                message: message,
                level: level,
            },
        });
    } catch (error) {
        console.error(`[Job ${jobId}] Failed to write log to DB: ${message}`, error);
    }
}

async function uploadToS3(buffer: Buffer, s3Key: string, contentType: string): Promise<string> {
    const params: AWS.S3.PutObjectRequest = {
        Bucket: S3_BUCKET_NAME,
        Key: s3Key,
        Body: buffer,
        ContentType: contentType,
    };
    const data = await s3.upload(params).promise();
    return data.Location;
}

export const processZipFile = async (zipBuffer: Buffer, jobId: string): Promise<ProcessingResult> => {
    await logProcessing(jobId, 'Starting ZIP file processing.');
    const zip = new AdmZip(zipBuffer);
    const zipEntries = zip.getEntries();

    let htmlFileEntry: AdmZip.IZipEntry | undefined;
    let htmlFileOriginalFullDir = '';
    const staticAssetEntries: { entry: AdmZip.IZipEntry; relativePath: string }[] = [];
    const fileMapForJson: { [originalPath: string]: { caminho_original: string; caminho_bucket: string; hash_md5: string } } = {};
    const internalFileMap: { [originalZipPath: string]: { s3Path: string; md5Hash: string } } = {};
    let processedFileCount = 0;
    const version = process.env.APP_VERSION || "1.0.0";

    // First pass: Identify HTML file and its directory, and filter out __MACOSX
    for (const entry of zipEntries) {
        if (entry.isDirectory || entry.entryName.startsWith('__MACOSX/')) {
            continue;
        }
        // Normalize entry name (remove leading ./) and decode if URI encoded
        let normalizedEntryName = decodeURIComponent(entry.entryName.replace(/^\.\//, ''));

        if (normalizedEntryName.toLowerCase().endsWith('.html')) {
            if (!htmlFileEntry) {
                htmlFileEntry = entry;
                // Determine the directory of the HTML file within the ZIP
                const pathParts = normalizedEntryName.split('/');
                pathParts.pop(); // Remove filename to get directory
                htmlFileOriginalFullDir = pathParts.join('/');
                if (htmlFileOriginalFullDir) htmlFileOriginalFullDir += '/'; // Add trailing slash if not root
            } else {
                await logProcessing(jobId, `Multiple HTML files found. Using '${htmlFileEntry.entryName}'. Ignoring '${normalizedEntryName}'.`, 'WARNING');
            }
        }
    }

    if (!htmlFileEntry) {
        await logProcessing(jobId, 'No HTML file found in the ZIP.', 'ERROR');
        throw new Error('No HTML file found in the ZIP.');
    }
    await logProcessing(jobId, `Identified HTML file: ${htmlFileEntry.entryName} (Original base directory: '${htmlFileOriginalFullDir}')`);

    // Second pass: Identify static assets relative to the HTML file's directory
    for (const entry of zipEntries) {
        if (entry.isDirectory || entry.entryName.startsWith('__MACOSX/') || entry.entryName === htmlFileEntry.entryName) {
            continue;
        }
        let normalizedEntryName = decodeURIComponent(entry.entryName.replace(/^\.\//, ''));

        // Check if the asset is within the same directory structure as the HTML file or its subdirectories
        if (normalizedEntryName.startsWith(htmlFileOriginalFullDir)) {
            // Calculate path relative to the HTML file's directory
            const relativePath = normalizedEntryName.substring(htmlFileOriginalFullDir.length);
            staticAssetEntries.push({ entry, relativePath });
        }
    }
    
    await logProcessing(jobId, `Found ${staticAssetEntries.length} static assets relative to HTML.`);

    // Process static assets
    for (const { entry, relativePath } of staticAssetEntries) {
        try {
            const assetBuffer = entry.getData();
            const md5Hash = crypto.createHash('md5').update(assetBuffer).digest('hex');
            const s3Key = `${jobId}/${relativePath}`; // Preserve original relative path under jobId folder
            const originalZipPath = entry.entryName.replace(/^\.\//, ''); // Path as it was in ZIP for mapping

            let contentType = 'application/octet-stream';
            const fileExtension = path.extname(entry.entryName).toLowerCase();
            if (fileExtension === '.css') contentType = 'text/css';
            else if (fileExtension === '.js') contentType = 'application/javascript';
            else if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(fileExtension)) contentType = `image/${fileExtension.substring(1)}`;
            // Add more content types as needed

            const s3Path = await uploadToS3(assetBuffer, s3Key, contentType);
            await logProcessing(jobId, `Uploaded ${originalZipPath} to ${s3Path} (S3 Key: ${s3Key})`);

            // For HTML replacement, we need the path relative to the HTML file
            internalFileMap[relativePath] = { s3Path, md5Hash }; 
            fileMapForJson[originalZipPath] = {
                caminho_original: originalZipPath,
                caminho_bucket: s3Path,
                hash_md5: md5Hash
            };

            await prisma.processedFile.create({
                data: {
                    uploadJobId: jobId,
                    originalPath: originalZipPath,
                    s3Path: s3Path,
                    md5Hash: md5Hash,
                }
            });
            processedFileCount++;
        } catch (error: any) {
            await logProcessing(jobId, `Error processing asset ${entry.entryName}: ${error.message}`, 'ERROR');
        }
    }

    let htmlContent = htmlFileEntry.getData().toString('utf8');

    // Update paths in HTML content
    for (const originalRelativePath in internalFileMap) {
        const s3ObjectUrl = internalFileMap[originalRelativePath].s3Path;
        // The S3 path for assets is already absolute. We need to make sure the HTML references them correctly.
        // The key for replacement is the path *as it appears in the HTML file*.
        // This path is `originalRelativePath` because we've structured S3 to mirror this.
        const escapedOriginalRelativePath = originalRelativePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const srcPattern = new RegExp(`src\s*=\s*(["'])${escapedOriginalRelativePath}(["'])`, 'g');
        htmlContent = htmlContent.replace(srcPattern, `src=$1${s3ObjectUrl}$2`);

        const hrefPattern = new RegExp(`href\s*=\s*(["'])${escapedOriginalRelativePath}(["'])`, 'g');
        htmlContent = htmlContent.replace(hrefPattern, `href=$1${s3ObjectUrl}$2`);

        const urlPattern = new RegExp(`url\(\s*(["']?)${escapedOriginalRelativePath}(["']?)\s*\)`, 'g');
        htmlContent = htmlContent.replace(urlPattern, `url($1${s3ObjectUrl}$2)`);
        
        await logProcessing(jobId, `HTML Path Update: Replaced '${originalRelativePath}' with '${s3ObjectUrl}'`);
    }

    // Add footer with version and build time
    const buildTimestamp = new Date().toISOString();
    const footerHtml = `\n<footer><p>Version: ${version} | Build: ${buildTimestamp}</p></footer>`;

    if (htmlContent.includes('</body>')) {
        htmlContent = htmlContent.replace('</body>', `${footerHtml}\n</body>`);
    } else {
        htmlContent += footerHtml;
        await logProcessing(jobId, 'No </body> tag found. Appended footer to the end of HTML.', 'WARNING');
    }
    await logProcessing(jobId, 'HTML content updated with S3 paths and footer.');

    // Upload the modified HTML to S3
    const finalHtmlBuffer = Buffer.from(htmlContent, 'utf8');
    const htmlS3Key = `${jobId}/${path.basename(htmlFileEntry.entryName)}`; // HTML file at the root of the job folder
    const finalHtmlS3Url = await uploadToS3(finalHtmlBuffer, htmlS3Key, 'text/html');
    await logProcessing(jobId, `Uploaded modified HTML to ${finalHtmlS3Url}`);

    return {
        htmlContent: htmlContent,
        mappingJson: fileMapForJson as unknown as Prisma.JsonValue,
        processedFileCount: processedFileCount,
        finalHtmlS3Url: finalHtmlS3Url
    };
};
