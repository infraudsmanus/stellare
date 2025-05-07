import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { processZipFile } from '../services/uploadService';

const prisma = new PrismaClient();

export const handleFileUpload = async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Nenhum arquivo ZIP enviado.' });
  }

  const originalZipName = req.file.originalname;
  let job;

  try {
    // 1. Create an UploadJob entry in the database
    job = await prisma.uploadJob.create({
      data: {
        originalZipName: originalZipName,
        status: 'PENDING',
      },
    });

    // 2. Log initial processing attempt
    await prisma.processingLog.create({
        data: {
            uploadJobId: job.id,
            message: `Iniciando processamento para o arquivo: ${originalZipName}`,
            level: 'INFO',
        }
    });

    // 3. Asynchronously process the file (or synchronously for now if simple enough)
    // For a real-world scenario, this should be offloaded to a queue/worker
    // to avoid blocking the HTTP request.
    await prisma.uploadJob.update({
        where: { id: job.id },
        data: { status: 'PROCESSING' },
    });
    
    const processingResult = await processZipFile(req.file.buffer, job.id);

    // 4. Update job status and save results
    await prisma.uploadJob.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        htmlContent: processingResult.htmlContent,
        mappingJson: processingResult.mappingJson,
      },
    });

    await prisma.processingLog.create({
        data: {
            uploadJobId: job.id,
            message: `Processamento concluído com sucesso para: ${originalZipName}`,
            level: 'INFO',
        }
    });

    res.status(200).json({
      message: 'Arquivo ZIP processado com sucesso!',
      jobId: job.id,
      htmlContent: processingResult.htmlContent, // Optionally return results directly
      mappingJson: processingResult.mappingJson,
    });

  } catch (error: any) {
    console.error('Erro durante o processamento do arquivo:', error);
    if (job) {
      try {
        await prisma.uploadJob.update({
          where: { id: job.id },
          data: { status: 'FAILED' },
        });
        await prisma.processingLog.create({
            data: {
                uploadJobId: job.id,
                message: `Falha no processamento: ${error.message}`,
                level: 'ERROR',
            }
        });
      } catch (dbError) {
        console.error('Erro ao atualizar status do job para FAILED:', dbError);
      }
    }
    res.status(500).json({ message: error.message || 'Falha ao processar o arquivo ZIP.' });
  }
};

