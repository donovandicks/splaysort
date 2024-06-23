import {
  SpotifyApi,
  type AudioFeatures,
  type Playlist,
  type TrackItem,
} from "@spotify/web-api-ts-sdk";
import { sleepSync } from "bun";
import { LocalAuthStrategy } from "./auth";
import { TokenCache } from "./cache";

export type Song = AudioFeatures & { name: string; artists: string[] };
export type Tracklist = {
  [key: string]: { id: string; name: string; artists: string[]; uri: string };
};

const Features = [
  "acousticness",
  "danceability",
  "duration_ms",
  "energy",
  "instrumentalness",
  "liveness",
  "loudness",
  "speechiness",
  "tempo",
  "valence",
] as const;

export type ComparableFeature = (typeof Features)[number];

export const IsComparableFeature = (
  feat: string
): feat is ComparableFeature => {
  return (Features as readonly string[]).includes(feat);
};

export class Spotify {
  private client: SpotifyApi;
  userId: string = "";

  constructor(cache: TokenCache) {
    this.client = new SpotifyApi(new LocalAuthStrategy(cache));
  }

  static async build(cache: TokenCache, userId?: string): Promise<Spotify> {
    const s = new Spotify(cache);
    s.userId = userId || (await s.client.currentUser.profile()).id;
    if (!s.userId) {
      throw new Error("Failed to get current Spotify user");
    }
    return s;
  }

  async getAllPlaylists(): Promise<Playlist<TrackItem>[]> {
    console.log(`Retrieving playlists from user ${this.userId}`);

    const fileName = `${this.userId}.playlists.json`;
    const playlistFile = Bun.file(fileName);
    if (await playlistFile.exists()) {
      console.log(`Cached playlists found at ${fileName}`);
      return JSON.parse(await playlistFile.text());
    }

    const playlists = (
      await this.client.playlists.getUsersPlaylists(this.userId)
    ).items;
    await Bun.write(playlistFile, JSON.stringify(playlists, undefined, 2));
    return playlists;
  }

  async getAllPlaylistTracks(playlist: Playlist): Promise<Tracklist> {
    console.log(
      `Retrieving tracks from playlist ${playlist.name} (${playlist.id})`
    );

    const fileName = `playlist-${playlist.name}/tracks.json`;
    const playlistTracksFile = Bun.file(fileName);
    if (await playlistTracksFile.exists()) {
      console.log(`Cached playlist tracks found at ${fileName}`);
      return JSON.parse(await playlistTracksFile.text());
    }

    const limit = 50;
    const allTracks: Tracklist = {};
    const fields =
      "total,limit,next,offset,items(track(id,name,uri,artists(name)))";

    let currOffset = 0;
    let page = await this.client.playlists.getPlaylistItems(
      playlist.id,
      undefined,
      fields,
      limit,
      currOffset
    );
    Object.assign(
      allTracks,
      page.items.reduce((acc, t) => {
        acc[t.track.id] = {
          id: t.track.id,
          name: t.track.name,
          artists: t.track.artists.map((a) => a.name),
          uri: t.track.uri,
        };
        return acc;
      }, {} as Tracklist)
    );

    while (page.next) {
      currOffset += limit;
      console.log(`Getting page of playlist tracks from offset ${currOffset}`);
      page = await this.client.playlists.getPlaylistItems(
        playlist.id,
        undefined,
        fields,
        limit,
        currOffset
      );
      Object.assign(
        allTracks,
        page.items.reduce((acc, t) => {
          acc[t.track.id] = {
            id: t.track.id,
            name: t.track.name,
            artists: t.track.artists.map((a) => a.name),
            uri: t.track.uri,
          };
          return acc;
        }, {} as Tracklist)
      );
    }

    await Bun.write(fileName, JSON.stringify(allTracks));
    return allTracks;
  }

  async getTracklistFeatures(
    playlist: Playlist,
    tracks: Tracklist
  ): Promise<Song[]> {
    console.log(
      `Retrieving audio features from playlist ${playlist.name} (${playlist.id})`
    );

    const fileName = `playlist-${playlist.name}/features.json`;
    const file = Bun.file(fileName);
    if (await file.exists()) {
      console.log(`Cached playlist features found at ${fileName}`);
      return JSON.parse(await file.text());
    }

    const allFeatures: Song[] = [];
    const chunkSize = 10;
    const trackIds = Object.keys(tracks);
    for (let i = 0; i < trackIds.length; i += chunkSize) {
      const chunk = trackIds.slice(i, i + chunkSize);
      const features = await this.client.tracks.audioFeatures(chunk);

      allFeatures.push(
        ...features.map((f) => {
          return {
            ...f,
            name: tracks[f.id].name,
            artists: tracks[f.id].artists,
          };
        })
      );
    }

    await Bun.write(fileName, JSON.stringify(allFeatures));
    return allFeatures;
  }

  async createPlaylist(playlistName: string): Promise<Playlist<TrackItem>> {
    console.log(`creating playlist '${playlistName}'`);

    const response = await this.client.playlists.createPlaylist(this.userId, {
      name: playlistName,
      public: true,
      collaborative: false,
      description: "Generated Automatically",
    });

    console.log(`Created playlist '${playlistName}'`); //, response);
    return response;
  }

  async addTracksToPlaylist(
    playlistId: string,
    trackUris: string[]
  ): Promise<void> {
    console.log(`adding ${trackUris.length} tracks to playlist ${playlistId}`);
    const chunkSize = 75;
    for (let i = 0; i < trackUris.length; i += chunkSize) {
      const chunk = trackUris.slice(i, i + chunkSize);
      console.log(
        `adding page ${Math.floor(i / chunkSize) + 1} of tracks to playlist`
      );

      await this.client.playlists.addItemsToPlaylist(playlistId, chunk);
      sleepSync(800);
    }
  }
}
