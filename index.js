const express = require('express')
require('dotenv').config()
const app = express()
const cors = require('cors');
const port = 3000
const { MongoClient, ServerApiVersion } = require('mongodb');

// middlewares
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASS}@cluster0.pn4qknt.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        await client.connect();

        // collections
        const db = client.db('corex-gym');
        const usersCollection = db.collection('users');
        const classesCollection = db.collection('classes');
        const trainersCollection = db.collection('trainers')

        // admin setup
        var admin = require("firebase-admin");
        var serviceAccount = require("./firebaseSDK.json");
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });

        // firebase token verification
        const userVerification = async (req, res, next) => {
            const auhorizationHeader = req.headers.authorization;
            const token = auhorizationHeader?.split(' ')[1];

            if (!token) {
                return res.status(401).send({ message: 'un-authorized' })
            }

            const userInfo = await admin.auth().verifyIdToken(token);
            const email = userInfo.email;

            req.firebaseEmail = email
            next()
        }


        // creat user
        app.post('/users', async (req, res) => {
            try {
                const userInfo = req.body;
                const query = { email: userInfo.email };
                // check user exists
                const existsUser = await usersCollection.findOne(query);

                if (existsUser) {
                    return res.send({
                        success: false,
                        message: "User already exists"
                    });
                }
                // insert new user
                const result = await usersCollection.insertOne(userInfo);

                res.status(201).send({
                    success: true,
                    insertedId: result.insertedId
                });
            } catch (error) {
                res.status(500).send({
                    success: false,
                    message: "Something went wrong",
                    error: error.message
                });
            }
        });




        // get classes
        app.get("/classes", async (req, res) => {
            try {
                const page = parseInt(req.query.page) || 1;
                const skip = (page - 1) * 6;

                const total = await classesCollection.estimatedDocumentCount();
                const classes = await classesCollection.find().skip(skip).limit(6).toArray();

                res.send({
                    totalPages: Math.ceil(total / 6),
                    classes
                });
            } catch (error) {
                res.status(500).json({ message: "Server error", error });
            }
        });



        // post trainers
        app.post("/trainers", userVerification, async (req, res) => {
            const firebaseEmail = req.firebaseEmail;
            const trainer = req.body;
            if(firebaseEmail!==trainer.email){
                return res.status(403).send({message:'Forbidden Access'})
            }
            const result = await trainersCollection.insertOne(trainer);
            res.json(result);
        });

        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
