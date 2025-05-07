import React from 'react';
import FileUpload from './components/FileUpload';

function App() {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-lg">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Upload de Arquivo ZIP
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Selecione um arquivo .zip para processamento
          </p>
        </div>
        <FileUpload />
      </div>
      <footer className="mt-8 text-center text-sm text-gray-500">
        {/* O rodapé com versão e data/hora será adicionado dinamicamente pelo backend ou script de build */}
        {/* Placeholder para o rodapé que será adicionado na etapa 009 */}
      </footer>
    </div>
  );
}

export default App;

