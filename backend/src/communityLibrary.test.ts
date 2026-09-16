import { logSearchMiss, parseCommunityFilename, searchCommunityLibrary } from './communityLibrary';

const ENV = { COMMUNITY_DROPBOX_REFRESH_TOKEN: 'fake-refresh-token' };

function mockFetchSequence(responses: { ok: boolean; json?: unknown; text?: string }[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  let i = 0;
  global.fetch = jest.fn((url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} });
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return Promise.resolve({
      ok: r.ok,
      json: () => Promise.resolve(r.json ?? {}),
      text: () => Promise.resolve(r.text ?? ''),
    } as Response);
  }) as unknown as typeof fetch;
  return calls;
}

describe('parseCommunityFilename', () => {
  it('parses "Title - Artist [Key].ext"', () => {
    expect(parseCommunityFilename('Iko Iko - Sugar Boy James Crawford [G].pro')).toEqual({
      title: 'Iko Iko',
      artist: 'Sugar Boy James Crawford',
      key: 'G',
    });
  });

  it('parses "Title - Artist.ext" with no key', () => {
    expect(parseCommunityFilename('Hotel California - Eagles.pro')).toEqual({
      title: 'Hotel California',
      artist: 'Eagles',
      key: null,
    });
  });

  it('parses a bare "Title.ext" with no artist', () => {
    expect(parseCommunityFilename('Amazing Grace.pro')).toEqual({
      title: 'Amazing Grace',
      artist: null,
      key: null,
    });
  });

  it('keeps a title-embedded " - Alt" suffix intact rather than mistaking it for the artist separator', () => {
    // Split is on the LAST " - ", deliberately different from the app's own
    // extractArtistFromPath (first) — see the doc comment on
    // parseCommunityFilename for why that matters for real titles like this
    // one in the community library.
    expect(parseCommunityFilename('Rum And Coca Cola - Alt - Andrews Sisters.pro')).toEqual({
      title: 'Rum And Coca Cola - Alt',
      artist: 'Andrews Sisters',
      key: null,
    });
  });

  it('handles a multi-key value inside the brackets', () => {
    expect(parseCommunityFilename('Desperado - Eagles [Am, G].pro')).toEqual({
      title: 'Desperado',
      artist: 'Eagles',
      key: 'Am, G',
    });
  });

  it('handles a .chopro extension the same as .pro', () => {
    expect(parseCommunityFilename('Lovesong - The Cure.chopro')).toEqual({
      title: 'Lovesong',
      artist: 'The Cure',
      key: null,
    });
  });
});

describe('searchCommunityLibrary', () => {
  it('filters out non-song files (e.g. a search-miss log) from the results', async () => {
    mockFetchSequence([
      { ok: true, json: { access_token: 'tok' } },
      {
        ok: true,
        json: {
          matches: [
            { metadata: { metadata: { name: 'Hotel California - Eagles.pro', path_lower: '/hotel california - eagles.pro' } } },
            {
              metadata: {
                metadata: {
                  name: '2026-09-15T00-00-00 - hotel california.txt',
                  path_lower: '/search-misses/2026-09-15t00-00-00 - hotel california.txt',
                },
              },
            },
          ],
        },
      },
    ]);
    const results = await searchCommunityLibrary(ENV, 'hotel california');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Hotel California');
  });

  it('keeps a real .txt song (not everything ending in .txt is a log entry)', async () => {
    mockFetchSequence([
      { ok: true, json: { access_token: 'tok' } },
      {
        ok: true,
        json: {
          matches: [
            { metadata: { metadata: { name: 'Amazing Grace.txt', path_lower: '/amazing grace.txt' } } },
          ],
        },
      },
    ]);
    const results = await searchCommunityLibrary(ENV, 'amazing grace');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Amazing Grace');
  });
});

describe('logSearchMiss', () => {
  it('uploads the raw query text to a new file under /search-misses', async () => {
    const calls = mockFetchSequence([{ ok: true, json: { access_token: 'tok' } }, { ok: true, json: {} }]);
    await logSearchMiss(ENV, 'some song nobody has');

    const uploadCall = calls[1];
    expect(uploadCall.url).toBe('https://content.dropboxapi.com/2/files/upload');
    expect(uploadCall.init.body).toBe('some song nobody has');
    const arg = JSON.parse((uploadCall.init.headers as Record<string, string>)['Dropbox-API-Arg']);
    expect(arg.path).toMatch(/^\/search-misses\/.+ - some song nobody has\.txt$/);
    expect(arg.mode).toBe('add');
  });

  it('strips characters unsafe in a filename from the query', async () => {
    const calls = mockFetchSequence([{ ok: true, json: { access_token: 'tok' } }, { ok: true, json: {} }]);
    await logSearchMiss(ENV, 'a/b:c*d?e"f<g>h|i');

    const arg = JSON.parse((calls[1].init.headers as Record<string, string>)['Dropbox-API-Arg']);
    const filename = arg.path.split('/').pop() as string;
    expect(filename).toBe(filename.match(/^[^/\\:*?"<>|]+$/)?.[0]);
  });

  it('throws (does not swallow) when the upload itself fails, so the caller can decide how to handle it', async () => {
    mockFetchSequence([{ ok: true, json: { access_token: 'tok' } }, { ok: false, text: 'server error' }]);
    await expect(logSearchMiss(ENV, 'x')).rejects.toThrow('server error');
  });
});
