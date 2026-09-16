// Extracts plain text from a Word (.docx) file's raw bytes — a .docx is a
// zip archive with its text sitting inside word/document.xml. Ported from
// docs/editor.html's own extractTextFromDocx/extractParagraphText (browser
// version, using JSZip + DOMParser). React Native has no DOMParser, so this
// walks word/document.xml with a small ordered regex scan instead of a real
// XML DOM — but preserves the same behavior of walking each paragraph's
// child nodes IN ORDER, so a manual line break (<w:br>) inside one Word
// "paragraph" still becomes a real line break here, not run together with
// the line after it. See AGENTS.md's "Known drift/duplication hotspots"
// section for why the web and app copies of logic like this are separately
// maintained rather than shared.
import JSZip from 'jszip';

const PARAGRAPH_RE = /<w:p\b[^>]*\/>|<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
const RUN_CONTENT_RE = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:(?:br|cr)\b[^>]*\/?>|<w:tab\b[^>]*\/?>/g;

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&amp;/g, '&'); // last, so a decoded entity's own "&" never gets re-processed
}

function extractParagraphText(paragraphXml: string): string {
  let text = '';
  RUN_CONTENT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RUN_CONTENT_RE.exec(paragraphXml)) !== null) {
    if (m[1] !== undefined) {
      text += decodeXmlEntities(m[1]);
    } else if (m[0].startsWith('<w:tab')) {
      text += '\t';
    } else {
      text += '\n'; // <w:br> or <w:cr>
    }
  }
  return text;
}

/** Reads a .docx file's raw bytes and returns its plain text, one Word paragraph per line. */
export async function extractDocxText(bytes: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const docFile = zip.file('word/document.xml');
  if (!docFile) {
    throw new Error("That doesn't look like a valid Word (.docx) file.");
  }
  const xml = await docFile.async('string');
  const lines: string[] = [];
  PARAGRAPH_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PARAGRAPH_RE.exec(xml)) !== null) {
    lines.push(m[1] !== undefined ? extractParagraphText(m[1]) : '');
  }
  return lines.join('\n');
}
