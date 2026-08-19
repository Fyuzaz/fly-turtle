/**
 * upload-adapter.js
 * CKEditor 5 Custom Upload Adapter
 * Integrado com a Biblioteca de Mídia — upload no servidor com fallback Base64
 */

class UploadAdapter {
  constructor(loader) {
    this.loader  = loader;
    const origin = (window.location.origin && window.location.origin.startsWith('http'))
      ? window.location.origin
      : 'http://localhost:3000';
    this.API_URL = `${origin}/api/media/upload`;
    this.xhr     = null;
  }

  upload() {
    return this.loader.file.then(file => new Promise((resolve, reject) => {
      // Detecta pasta ativa na gaveta de mídia ou usa 'Imagens'
      const folderEl = document.querySelector('.folder-item.active');
      const folder   = folderEl?.dataset?.name || 'Imagens';

      const sid = window.MediaLibrary?.getSessionId() || localStorage.getItem('wm_session_id') || '';

      this.xhr = new XMLHttpRequest();
      this.xhr.open('POST', `${this.API_URL}?folder=${encodeURIComponent(folder)}`);
      this.xhr.setRequestHeader('x-folder', encodeURIComponent(folder));
      if (sid) this.xhr.setRequestHeader('x-session-id', sid);

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

            // Atualiza a gaveta de mídia se estiver visível
            window.MediaLibrary?.loadFiles(folder);
            window.showToast?.(`"${file.name}" salva no servidor!`, 'success');
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
        console.warn('[UploadAdapter] Servidor offline — usando fallback Base64.');
        this._base64(file).then(resolve).catch(reject);
      });

      const fd = new FormData();
      fd.append('folder', folder);
      fd.append('file', file);
      this.xhr.send(fd);
    }));
  }

  abort() {
    this.xhr?.abort();
  }

  /** Converte o arquivo para Base64 — fallback caso o backend não esteja acessível */
  _base64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve({ default: reader.result });
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}
