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
    accessKeyId: process.env.AWS_ACCESS_KEY_ID, // Ensure these are in .env or environment
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

interface ProcessingResult {
    htmlContent: string | null;
    mappingJson: Prisma.JsonValue | null;
    processedFileCount: number;
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
        // ACL: 'public-read' // Consider bucket policy for public access. For now, handled by bucket policy.
    };
    const data = await s3.upload(params).promise();
    return data.Location; 
}

export const processZipFile = async (zipBuffer: Buffer, jobId: string): Promise<ProcessingResult> => {
    await logProcessing(jobId, 'Starting ZIP file processing.');
    const zip = new AdmZip(zipBuffer);
    const zipEntries = zip.getEntries();
    
    let htmlFileEntry: AdmZip.IZipEntry | undefined;
    const staticAssetEntries: AdmZip.IZipEntry[] = [];
    const fileMapForJson: { [originalPath: string]: { caminho_original: string; caminho_bucket: string; hash_md5: string } } = {};
    const internalFileMap: { [originalPath: string]: { s3Path: string; md5Hash: string } } = {};
    let processedFileCount = 0;
    const version = process.env.APP_VERSION || "1.0.0"; // Get version from env or default

    for (const entry of zipEntries) {
        if (entry.isDirectory) continue;
        const entryNameNormalized = entry.entryName.replace(/^\.\//, ''); // Normalize path by removing leading ./ if present

        if (entryNameNormalized.toLowerCase().endsWith('.html')) {
            if (!htmlFileEntry) {
                htmlFileEntry = entry;
            } else {
                await logProcessing(jobId, `Multiple HTML files found. Using '${htmlFileEntry.entryName}'. Ignoring '${entryNameNormalized}'.`, 'WARNING');
            }
        } else if (entryNameNormalized.startsWith('css/') || entryNameNormalized.startsWith('js/') || entryNameNormalized.startsWith('images/')) {
            staticAssetEntries.push(entry);
        }
    }

    if (!htmlFileEntry) {
        await logProcessing(jobId, 'No HTML file found in the ZIP.', 'ERROR');
        throw new Error('No HTML file found in the ZIP.');
    }

    await logProcessing(jobId, `Found HTML file: ${htmlFileEntry.entryName}. Found ${staticAssetEntries.length} static assets.`);

    for (const assetEntry of staticAssetEntries) {
        try {
            const assetBuffer = assetEntry.getData();
            const md5Hash = crypto.createHash('md5').update(assetBuffer).digest('hex');
            const fileExtension = path.extname(assetEntry.entryName);
            const s3Key = `${md5Hash}${fileExtension}`;
            const originalAssetPathNormalized = assetEntry.entryName.replace(/^\.\//, '');
            
            let contentType = 'application/octet-stream';
            if (fileExtension === '.css') contentType = 'text/css';
            else if (fileExtension === '.js') contentType = 'application/javascript';
            else if (['.png', '.jpg', '.jpeg', '.gif', '.svg'].includes(fileExtension.toLowerCase())) contentType = `image/${fileExtension.substring(1)}`;

            const s3Path = await uploadToS3(assetBuffer, s3Key, contentType);
            await logProcessing(jobId, `Uploaded ${originalAssetPathNormalized} to ${s3Path}`);

            internalFileMap[originalAssetPathNormalized] = { s3Path, md5Hash };
            fileMapForJson[originalAssetPathNormalized] = {
                caminho_original: originalAssetPathNormalized,
                caminho_bucket: s3Path, 
                hash_md5: md5Hash
            };
            
            await prisma.processedFile.create({
                data: {
                    uploadJobId: jobId,
                    originalPath: originalAssetPathNormalized,
                    s3Path: s3Path,
                    md5Hash: md5Hash,
                }
            });
            processedFileCount++;
        } catch (error: any) {
            await logProcessing(jobId, `Error processing asset ${assetEntry.entryName}: ${error.message}`, 'ERROR');
        }
    }

    let htmlContent = htmlFileEntry.getData().toString('utf8');

    for (const originalPath in internalFileMap) {
        const newPath = internalFileMap[originalPath].s3Path;
        const escapedOriginalPath = originalPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        const srcPattern = new RegExp(`src=(['\"'])${escapedOriginalPath}(['\"'])`, 'g');
        htmlContent = htmlContent.replace(srcPattern, `src=$1${newPath}$2`);

        const hrefPattern = new RegExp(`href=(['\"'])${escapedOriginalPath}(['\"'])`, 'g');
        htmlContent = htmlContent.replace(hrefPattern, `href=$1${newPath}$2`);

        const urlPattern = new RegExp(`url\((['\"']?)${escapedOriginalPath}(['\"']?)\)`, 'g');
        htmlContent = htmlContent.replace(urlPattern, `url($1${newPath}$2)`);
    }

    // Add footer with version and build time
    const buildTimestamp = new Date().toISOString();
    const footerHtml = `\n<footer><p>Version: ${version} | Build: ${buildTimestamp}</p></footer>`;
    
    if (htmlContent.includes('</body>')) {
        htmlContent = htmlContent.replace('</body>', `${footerHtml}\n</body>`);
    } else {
        htmlContent += footerHtml; // Fallback if no body tag
        await logProcessing(jobId, 'No </body> tag found. Appended footer to the end of HTML.', 'WARNING');
    }

    await logProcessing(jobId, 'HTML content updated with S3 paths and footer.');

    // Upload the modified HTML to S3 as index.html
    const finalHtmlBuffer = Buffer.from(htmlContent, 'utf8');
    const htmlS3Key = 'index.html'; // Or a job-specific path like `${jobId}/index.html`
    const finalHtmlS3Url = await uploadToS3(finalHtmlBuffer, htmlS3Key, 'text/html');
    await logProcessing(jobId, `Uploaded modified HTML to ${finalHtmlS3Url}`);

    return {
        htmlContent: htmlContent, // Return the modified HTML content
        mappingJson: fileMapForJson as unknown as Prisma.JsonValue, // Cast to Prisma.JsonValue
        processedFileCount: processedFileCount,
    };
};
