// The physical prototype's project gallery + build updates.
// Anton adds entries over time (newest first): send new photos, they get
// uploaded to the media bucket and appended here. Captions stay English for
// now (photo captions, not UI chrome).

const MEDIA = 'https://qvzqdjxdfxlciieboguq.supabase.co/storage/v1/object/public/media/koos-puzzle';

export interface PrototypePhoto {
  url: string;
  caption: string;
}

export interface PrototypeUpdate {
  date: string; // ISO date
  title: string;
  body: string;
  imageUrl?: string;
}

export const PROTOTYPE_PHOTOS: PrototypePhoto[] = [
  { url: `${MEDIA}/anton-with-pyramid.jpg`, caption: 'Anton with a completed red pyramid on the play tray.' },
  { url: `${MEDIA}/steel-pyramid.jpg`, caption: 'The brushed stainless-steel prototype.' },
  { url: `${MEDIA}/red-set-laid-out.jpg`, caption: 'A full 25-piece set in glossy red, laid out before a solve.' },
  { url: `${MEDIA}/red-pyramid-tray.jpg`, caption: 'A completed pyramid on the KOOS PUZZLE tray.' },
  { url: `${MEDIA}/white-dome-tray.jpg`, caption: 'The matte white prototype: a dome-like target shape.' },
  { url: `${MEDIA}/red-roof-closeup.jpg`, caption: 'The 100-sphere roof shape — all 25 pieces used exactly once.' },
  { url: `${MEDIA}/anton-solving.jpg`, caption: 'Mid-solve in red and white.' },
  { url: `${MEDIA}/render-travel-case.jpg`, caption: 'Design render of the prototype storage case: the dimpled play tray doubles as the lid.' },
  { url: `${MEDIA}/white-prototype-pieces.jpg`, caption: 'Early prototype pieces, printed in matte white.' },
  { url: `${MEDIA}/render-25-pieces.jpg`, caption: 'All 25 pieces — every way to join four spheres in the lattice.' },
];

export const PROTOTYPE_UPDATES: PrototypeUpdate[] = [
  {
    date: '2026-07-17',
    title: 'Three materials, one puzzle',
    body: 'Working prototypes now exist in glossy red, matte white, and brushed stainless steel, with a dimpled play tray that registers the bottom layer of spheres and doubles as the lid of the piece storage case. Whether this goes into production depends on one thing: enough people saying they want one.',
    imageUrl: `${MEDIA}/steel-pyramid.jpg`,
  },
];
