type ClientCredentials = {
  id: string;
  secret: string;
};

export const loadCredentials = async (): Promise<ClientCredentials> => {
  const envFile = Bun.file(".env");
  if (!envFile) {
    throw new Error("Unable to find .env file");
  }

  const creds: { [key: string]: string } = {};
  const data = (await envFile.text()).trim();
  for (const entry of data.split("\n")) {
    const [key, value] = entry.split("=");
    creds[key.trim()] = value.trim();
  }

  return creds as ClientCredentials;
};

export const scopes = [
  "playlist-read-private",
  "playlist-modify-public",
  "playlist-modify-private",
  "user-library-read",
  "user-library-modify",
  "user-read-private",
];

if (import.meta.main) {
  console.log(scopes.join(","));
}
