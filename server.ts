import type { AccessToken } from "@spotify/web-api-ts-sdk";
import express from "express";
import open from "open";
import { TokenCache } from "./cache";
import { loadCredentials, scopes } from "./config";
import { TracklistFeatures } from "./lib";
import {
  IsComparableFeature,
  Spotify,
  type ComparableFeature,
} from "./spotify";

export type ServerOptions = {
  scopes: string[];
  tokenCache: TokenCache;
  showDialog?: boolean;
  port?: string;
};

export const run = async (opts: ServerOptions) => {
  const clientCreds = await loadCredentials();
  opts.showDialog = opts.showDialog === undefined ? false : opts.showDialog;
  opts.port = opts.port === undefined ? "3000" : opts.port;

  const scope = opts.scopes.join("%20");
  const redirect_uri = `http://localhost:${opts.port}/callback`;

  const URL =
    "https://accounts.spotify.com/authorize" +
    `?client_id=${clientCreds.id}` +
    "&response_type=token" +
    `&scope=${scope}` +
    `&show_dialog=${opts.showDialog}` +
    `&redirect_uri=${redirect_uri}`;

  const app = express();
  app.use(express.json());

  app.get("/callback", (req, res) => {
    res.sendFile(__dirname + "/callback.html");
    if (req.query.error) {
      console.error(`Something went wrong: ${req.query.error}`);
    }
  });

  app.get("/token", (req, res) => {
    res.sendStatus(200);

    const token = {
      access_token: req.query.access_token as string,
      token_type: req.query.token_type as string,
      expires_in: Number(req.query.expires_in as string),
      refresh_token: "",
    } as AccessToken;

    if (token.access_token) {
      console.log("Your token is:", token);
      opts.tokenCache.setToken(token);
    } else {
      console.error(
        "failed to get token from request",
        req.statusCode,
        req.body
      );
    }
  });

  app.post("/playlist", async (req, res) => {
    try {
      console.log("received request", req.body, req.params, req.headers);
      const spotify = await Spotify.build(opts.tokenCache);

      if (req.body === undefined) {
        throw new Error("missing request body");
      }

      const body = req.body as {
        playlistName: string;
        features: ComparableFeature[];
        scoringFunction?: string;
        createPlaylist?: boolean;
      };

      if (!body.features.every((f) => IsComparableFeature(f))) {
        throw new Error("Invalid features");
      }

      const tlf = await TracklistFeatures.build(spotify, body.playlistName);
      const trackIds = await tlf.sortByFeature(body.features);

      if (body.createPlaylist) {
        const newPlaylistName = `${body.playlistName} by ${body.features[0]}`;
        const playlist = await spotify.createPlaylist(newPlaylistName);
        spotify.addTracksToPlaylist(
          playlist.id,
          tlf.getUrisForTracks(trackIds)
        );
      }

      res.sendStatus(201);
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    }
  });

  console.log("express listening");
  app.listen(opts.port, () => {
    console.log("Opening the Spotify Login Dialog in your browser...");
    open(URL);
  });
};

if (import.meta.main) {
  run({
    tokenCache: new TokenCache(),
    scopes: scopes,
  });
}
