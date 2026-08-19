"""
main.py
Serviço Python/FastAPI — Exportação para DOCX via Pandoc
WebDoc Editor

Porta padrão: 8000
Rodar com: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field
from typing import Optional
import pypandoc
import tempfile
import os
import logging

# ── Logging ───────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# ── App ───────────────────────────────────────────────────
app = FastAPI(
    title="WebDoc — Serviço de Exportação DOCX",
    description="Converte HTML para DOCX (Microsoft Word) via Pandoc com suporte a tamanhos de página customizados.",
    version="1.0.0",
)

# ── CORS (permite requisições do frontend local) ──────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)


# ── Schema de entrada ─────────────────────────────────────
class ExportRequest(BaseModel):
    html: str = Field(..., description="Conteúdo HTML do documento")
    doc_name: Optional[str] = Field("documento", description="Nome do arquivo para download")
    docName: Optional[str] = Field(None, description="Nome do arquivo para download")
    pageWidth: Optional[float] = Field(None, description="Largura da página em mm")
    pageHeight: Optional[float] = Field(None, description="Altura da página em mm")
    page_width_mm: Optional[float] = Field(210.0, description="Largura da página em mm (padrão: A4 = 210mm)")
    page_height_mm: Optional[float] = Field(297.0, description="Altura da página em mm (padrão: A4 = 297mm)")
    landscape: Optional[bool] = Field(False, description="Orientação paisagem")
    format_name: Optional[str] = Field("A4", description="Nome do formato (informativo)")
    formatName: Optional[str] = Field(None, description="Nome do formato (informativo)")


# ── Conversão mm → cm (Pandoc usa cm para margens) ───────
def mm_to_cm(mm: float) -> float:
    return mm / 10.0


# ── Gera um arquivo DOCX de referência via Pandoc ────────
def _build_pandoc_args(req: ExportRequest) -> list[str]:
    """
    Retorna os extra_args para o Pandoc.
    """
    raw_w = req.pageWidth if req.pageWidth is not None else (req.page_width_mm or 210.0)
    raw_h = req.pageHeight if req.pageHeight is not None else (req.page_height_mm or 297.0)

    # Se a largura e altura já estiverem invertidas pelo frontend no modo paisagem, mantém
    w = float(raw_w)
    h = float(raw_h)

    margin_top_cm = max(0.5, min(2.5, mm_to_cm(h * 0.08)))
    margin_side_cm = max(0.5, min(2.0, mm_to_cm(w * 0.08)))

    args = [
        "--toc",                     # Sumário automático
        "--toc-depth=3",
        "-V", f"paperwidth={mm_to_cm(w):.1f}cm",
        "-V", f"paperheight={mm_to_cm(h):.1f}cm",
        "-V", f"margin-top={margin_top_cm:.2f}cm",
        "-V", f"margin-bottom={margin_top_cm:.2f}cm",
        "-V", f"margin-left={margin_side_cm:.2f}cm",
        "-V", f"margin-right={margin_side_cm:.2f}cm",
        "--standalone",
    ]
    return args


# ── Rota principal ────────────────────────────────────────
@app.post(
    "/api/export/docx",
    summary="Exportar documento para DOCX",
    response_description="Arquivo .docx pronto para download",
)
async def export_docx(req: ExportRequest):
    """
    Recebe HTML e parâmetros de página, converte para DOCX via Pandoc
    e retorna o arquivo para download.
    """
    if not req.html or not req.html.strip():
        raise HTTPException(status_code=400, detail="O campo 'html' não pode estar vazio.")

    if req.page_width_mm and req.page_width_mm < 10:
        raise HTTPException(status_code=400, detail="Largura da página inválida (mínimo: 10mm).")
    if req.page_height_mm and req.page_height_mm < 10:
        raise HTTPException(status_code=400, detail="Altura da página inválida (mínimo: 10mm).")

    logger.info(
        f"Exportando DOCX | Formato: {req.format_name} | "
        f"{req.page_width_mm}×{req.page_height_mm}mm | "
        f"Paisagem: {req.landscape}"
    )

    # Wraps o HTML com estrutura básica para melhor conversão
    full_html = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>{req.doc_name or 'Documento'}</title></head>
<body>
{req.html}
</body>
</html>"""

    # Arquivo temporário de saída
    with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        extra_args = _build_pandoc_args(req)

        pypandoc.convert_text(
            source=full_html,
            to="docx",
            format="html",
            outputfile=tmp_path,
            extra_args=extra_args,
        )

        with open(tmp_path, "rb") as f:
            docx_bytes = f.read()

        # Nome seguro para o arquivo
        safe_name = (req.doc_name or "documento").replace(" ", "_")
        safe_name = "".join(c for c in safe_name if c.isalnum() or c in "-_")[:50] or "documento"
        filename = f"{safe_name}_{req.format_name}.docx"

        logger.info(f"DOCX gerado com sucesso: {len(docx_bytes)} bytes")

        return Response(
            content=docx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except Exception as e:
        logger.error(f"Erro ao converter para DOCX: {e}")
        raise HTTPException(status_code=500, detail=f"Erro na conversão: {str(e)}")

    finally:
        # Limpa o arquivo temporário
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


# ── Health check ──────────────────────────────────────────
@app.get("/health", summary="Verificar se o serviço está rodando")
async def health():
    return {
        "status": "ok",
        "service": "WebDoc DOCX Export",
        "pandoc_version": pypandoc.get_pandoc_version(),
    }


# ── Ponto de entrada ──────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
