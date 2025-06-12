import clientPromise from "../../../lib/mongodb";

export const dynamic = 'force-static'

export async function GET() {
    const client = await clientPromise;
    const db = client.db("the-circle");
    const users = await db.collection("user").find({}).toArray();
    return Response.json(users)
}
