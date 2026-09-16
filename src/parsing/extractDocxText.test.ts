import JSZip from 'jszip';
import { extractDocxText } from './extractDocxText';

const WORD_XML_NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

/** Builds a minimal, real-shaped word/document.xml body from paragraph XML fragments. */
function documentXml(...paragraphsXml: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${WORD_XML_NS}><w:body>${paragraphsXml.join('')}</w:body></w:document>`;
}

function paragraph(...runsXml: string[]): string {
  return `<w:p>${runsXml.join('')}</w:p>`;
}

function run(text: string): string {
  return `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
}

async function buildDocx(xml: string): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('word/document.xml', xml);
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('extractDocxText', () => {
  it('extracts plain paragraph text, one Word paragraph per line', async () => {
    const xml = documentXml(paragraph(run('First line')), paragraph(run('Second line')));
    const bytes = await buildDocx(xml);
    expect(await extractDocxText(bytes)).toBe('First line\nSecond line');
  });

  it('turns a manual <w:br> line break inside one paragraph into a real line break', async () => {
    const xml = documentXml(
      paragraph(run('Verse one'), '<w:r><w:br/></w:r>', run('still one paragraph'))
    );
    const bytes = await buildDocx(xml);
    expect(await extractDocxText(bytes)).toBe('Verse one\nstill one paragraph');
  });

  it('turns a <w:tab> into a real tab character', async () => {
    const xml = documentXml(paragraph(run('Chorus'), '<w:r><w:tab/></w:r>', run('here')));
    const bytes = await buildDocx(xml);
    expect(await extractDocxText(bytes)).toBe('Chorus\there');
  });

  it('decodes XML entities in the extracted text', async () => {
    const xml = documentXml(paragraph(run('Rock &amp; roll &lt;encore&gt; &quot;yeah&quot;')));
    const bytes = await buildDocx(xml);
    expect(await extractDocxText(bytes)).toBe('Rock & roll <encore> "yeah"');
  });

  it('produces an empty line for an empty (self-closing) paragraph', async () => {
    const xml = documentXml(paragraph(run('Before')), '<w:p/>', paragraph(run('After')));
    const bytes = await buildDocx(xml);
    expect(await extractDocxText(bytes)).toBe('Before\n\nAfter');
  });

  it('reassembles a chord-above-lyric layout typed across two paragraphs', async () => {
    const xml = documentXml(paragraph(run('C          G')), paragraph(run('Amazing grace')));
    const bytes = await buildDocx(xml);
    expect(await extractDocxText(bytes)).toBe('C          G\nAmazing grace');
  });

  it('throws a clear error for a zip file with no word/document.xml (not a real .docx)', async () => {
    const zip = new JSZip();
    zip.file('hello.txt', 'not a word document');
    const bytes = await zip.generateAsync({ type: 'arraybuffer' });
    await expect(extractDocxText(bytes)).rejects.toThrow("doesn't look like a valid Word");
  });
});
