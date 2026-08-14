/**
 * upload-adapter.js
 * CKEditor 5 Custom Upload Adapter
 * Integrado com a Biblioteca de Mídia — upload profissional com fallback Base64
 */

class UploadAdapter {
  constructor(loader) {
    this.loader  = loader;
    this.API_URL = 'http://localhost:3000/api/media/upload';
    this.xhr     = null;
  }

  upload() {
    return this.loader.file.then(file => new Promise((resolve, reject) => {
      // Detecta pasta ativa na gaveta de mídia
      const folderEl = document.querySelector('.folder-item.active');
      const folder   = folderEl?.dataset?.name || 'Imagens';

      this.xhr = new XMLHttpRequest();
      this.xhr.open('POST', this.API_URL);

      // Progresso de upload
      this.xhr.upload.addEventListener('progress', evt => {
        if (evt.lengthComputable) {
          this.loader.uploadTotal = evt.total;
          this.loader.uploaded    = evt.loaded;
        }
      });

      this.xhr.addEventListener('load', () => {
        if (this.xhr.status >= 200 && this.xhr.status < 300) {
          try {
            const resp = JSON.parse(this.xhr.response);
            resolve({ default: resp.url });

            // Atualiza a gaveta de mídia se estiver aberta
            const drawer = document.getElementById('media-drawer');
            if (drawer?.classList.contains('open')) {
              window.MediaLibrary?.loadFiles(folder);
            }
          } catch {
            reject('Resposta inválida do servidor.');
          }
        } else {
          // Tenta fallback Base64 em caso de erro HTTP
          console.warn('[UploadAdapter] Erro HTTP', this.xhr.status, '— usando fallback Base64.');
          this._base64(file).then(resolve).catch(reject);
        }
      });

      this.xhr.addEventListener('error', () => {
        console.warn('[UploadAdapter] Servidor indisponível — usando fallback Base64.');
        this._base64(file).then(resolve).catch(reject);
      });

      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', folder);
      this.xhr.send(fd);
    }));
  }

  abort() {
    this.xhr?.abort();
  }

  /** Converte o arquivo para Base64 — usado quando o servidor está offline */
  _base64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve({ default: reader.result });
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}
