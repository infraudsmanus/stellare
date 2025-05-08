import React, { useState } from 'react';

function App() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [uploadStatus, setUploadStatus] = useState(''); // 'success', 'error', or ''

  const onFileChange = (event) => {
    setFile(event.target.files[0]);
    setMessage('');
    setUploadStatus(''); // Clear status on new file selection
  };

  const onFileUpload = async () => {
    if (!file) {
      setMessage('Por favor, selecione um arquivo primeiro.');
      setUploadStatus('error');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setMessage('Enviando arquivo...');
    setUploadStatus(''); // Clear status at the beginning of an upload

    const formData = new FormData();
    formData.append('zipfile', file);

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'http://localhost:3001/api/uploads', true);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentCompleted = Math.round((event.loaded * 100) / event.total);
          setUploadProgress(percentCompleted);
        }
      };

      xhr.onload = () => {
        setUploading(false);
        if (xhr.status === 200) {
          setMessage('Arquivo enviado com sucesso!');
          setUploadStatus('success');
          // const response = JSON.parse(xhr.responseText);
          // console.log('Server response:', response);
        } else {
          setMessage(`Erro no upload: ${xhr.statusText || 'Ocorreu um erro.'}`);
          setUploadStatus('error');
          console.error('Upload failed:', xhr.statusText, xhr.responseText);
        }
      };

      xhr.onerror = () => {
        setUploading(false);
        setMessage('Erro de rede ou o servidor não pôde ser alcançado.');
        setUploadStatus('error');
        console.error('Upload failed due to network error.');
      };

      xhr.send(formData);

    } catch (error) {
      setUploading(false);
      setMessage(`Erro: ${error.message}`);
      setUploadStatus('error');
      console.error('Upload error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-lg">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Upload de Arquivo ZIP para Processamento
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Selecione um arquivo .zip para enviar.
          </p>
        </div>
        <div className="mt-8 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Arquivo ZIP
            </label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
              <div className="space-y-1 text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="flex text-sm text-gray-600">
                  <label htmlFor="file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500">
                    <span>Carregar um arquivo</span>
                    <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={onFileChange} accept=".zip"/>
                  </label>
                  <p className="pl-1">ou arraste e solte</p>
                </div>
                <p className="text-xs text-gray-500">
                  ZIP até 100MB
                </p>
              </div>
            </div>
          </div>

          {file && (
            <div className="text-sm text-gray-500">
              Arquivo selecionado: {file.name}
            </div>
          )}

          {uploading && (
            <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
              <div className="bg-indigo-600 h-2.5 rounded-full" style={{ width: `${uploadProgress}%` }}></div>
              <p className="text-xs text-center text-indigo-700 mt-1">{uploadProgress}%</p>
            </div>
          )}

          {message && (
            <p className={`text-sm ${uploadStatus === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {message}
            </p>
          )}

          <div>
            <button
              type="button"
              onClick={onFileUpload}
              disabled={!file || uploading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {uploading ? 'Enviando...' : 'Enviar para Processamento'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

