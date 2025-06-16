import { MongoClient, Db } from 'mongodb';

const uri = 'mongodb+srv://msari1:MikailSari2006@tulpreizen.7itrp.mongodb.net/'; // of je connection string van Atlas
const dbName = 'TheCircleA3';

let client: MongoClient;
let db: Db;

export async function connectToDatabase(): Promise<Db> {
    if (db) return db; // return cached connection

    client = new MongoClient(uri);
    await client.connect();
    db = client.db(dbName);

    console.log('Verbonden met MongoDB');
    return db;
}

export function disconnect() {
    if (client) {
        client.close();
        console.log('MongoDB verbinding gesloten');
    }
}
