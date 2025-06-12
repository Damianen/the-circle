import { MongoClient, MongoClient } from "mongodb"

if (!process.env.MONGODB_URI) {
    throw new Error("Add MONGODB_URI env variable");
}

const uri: string = process.env.MONGODB_URI;
const options = {};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

declare global {
    var _mongoClientPromise: Promise<MongoClient>;
}

if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
        client = new MongoClient(uri, options);
        global._mongoClientPromise = client.connect();
    }
    clientPromise = global._mongoClientPromise;
} else {
    client = new MongoClient(uri, options);
    clientPromise = client.connect();
}

export default clientPromise;
