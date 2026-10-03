import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

console.log("🔎 MONGODB URI CHECK:", {
  exists: Boolean(uri),
  startsCorrectly: uri?.startsWith("mongodb+srv://"),
  length: uri?.length,
  hasSpaces: uri ? /\s/.test(uri) : false,
});

if (!uri) {
  throw new Error("Missing MONGODB_URI environment variable");
}

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === "development") {
  if (!global._mongoClientPromise) {
    console.log("🔧 Creating MongoClient...");

    const client = new MongoClient(uri);

    global._mongoClientPromise = client.connect();
  }

  clientPromise = global._mongoClientPromise;
} else {
  const client = new MongoClient(uri);

  clientPromise = client.connect();
}

export default clientPromise;
