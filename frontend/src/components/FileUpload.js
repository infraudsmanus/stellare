import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

function FileUpload() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(''); // e.g., 'uploading', 'success', 'error'
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorDetails, setErrorDetails] = useState('');

  const onDrop = useCallback(acceptedFiles => {
    if (acceptedFiles && acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      if (file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
        setSelectedFile(file);
        setUploadStatus('');
        setErrorDetails('');
      } else {
        setSelectedFile(null);
        setErrorDetails('Por favor, selecione um arquivo .zip válido.');
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/zip': ['.zip'],
      'application/x-zip-compressed': ['.zip']
    },
    multiple: false
  });

  const handleUpload = async () => {
    if (!selectedFile) {
      setErrorDetails('Nenhum arquivo selecionado para upload.');
      return;
    }

    setUploadStatus('uploading');
    setUploadProgress(0);
    setErrorDetails('');

    const formData = new FormData();
    formData.append('zipfile', selectedFile);

    try {
      // Placeholder for actual API call
      const response = await fetch('http://localhost:3001/api/uploads', { // Replace with actual backend endpoint
        method: 'POST',
        body: formData,
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentCompleted);
        }
      });

      // // Simulate API call for now
      // await new Promise(resolve => setTimeout(resolve, 2000)); 
      // // Simulate progress
      // let currentProgress = 0;
      // const interval = setInterval(() => {
      //   currentProgress += 10;
      //   if (currentProgress <= 100) {
      //     setUploadProgress(currentProgress);
      //   } else {
      //     clearInterval(interval);
      //     // Simulate success or error
      //     const success = Math.random() > 0.3; // Simulate success/failure
      //     if (success) {
      //       setUploadStatus('success');
      //       setSelectedFile(null); // Clear selection on success
      //     } else {
      //       setUploadStatus('error');
      //       setErrorDetails('Falha no upload. Tente novamente.');
      //     }
      //   }
      // }, 200);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Falha no upload');
      }
      setUploadStatus('success');
      setSelectedFile(null); // Clear selection on success

    } catch (error) {
      setUploadStatus('error');
      setErrorDetails(error.message || 'Ocorreu um erro desconhecido durante o upload.');
    }
  };

  return (
    <form className="mt-8 space-y-6" onSubmit={(e) => e.preventDefault()}>
      <div 
        {...getRootProps()} 
        className={`w-full p-6 border-2 border-dashed rounded-md text-center cursor-pointer ${isDragActive ? 'border-indigo-600 bg-indigo-50' : 'border-gray-300 hover:border-gray-400'}`}>
        <input {...getInputProps()} />
        {
          isDragActive ?
            <p className="text-indigo-700">Solte o arquivo .zip aqui...</p> :
            <p className="text-gray-500">Arraste e solte um arquivo .zip aqui, ou clique para selecionar</p>
        }
      </div>

      {selectedFile && (
        <div className="mt-4 p-3 bg-gray-50 rounded-md">
          <p className="text-sm font-medium text-gray-700">Arquivo selecionado: <span className="font-normal text-gray-900">{selectedFile.name}</span></p>
          <p className="text-xs text-gray-500">Tamanho: {(selectedFile.size / 1024).toFixed(2)} KB</p>
        </div>
      )}

      {errorDetails && (
        <div className="mt-2 p-3 bg-red-50 rounded-md">
          <p className="text-sm text-red-700">{errorDetails}</p>
        </div>
      )}

      {uploadStatus === 'uploading' && (
        <div className="w-full bg-gray-200 rounded-full h-2.5 mt-4">
          <div className="bg-indigo-600 h-2.5 rounded-full" style={{ width: `${uploadProgress}%` }}></div>
          <p className="text-xs text-center text-indigo-700 mt-1">{uploadProgress}%</p>
        </div>
      )}

      {uploadStatus === 'success' && (
        <div className="mt-4 p-3 bg-green-50 rounded-md">
          <p className="text-sm text-green-700">Upload concluído com sucesso!</p>
        </div>
      )}
      
      {uploadStatus === 'error' && !errorDetails && (
         <div className="mt-2 p-3 bg-red-50 rounded-md">
          <p className="text-sm text-red-700">Falha no upload. Tente novamente.</p>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={handleUpload}
          disabled={!selectedFile || uploadStatus === 'uploading'}
          className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {uploadStatus === 'uploading' ? 'Enviando...' : 'Enviar Arquivo'}
        </button>
      </div>
    </form>
  );
}

export default FileUpload;

