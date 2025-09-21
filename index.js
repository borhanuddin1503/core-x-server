const express = require('express')
require('dotenv').config()
const app = express()
const cors = require('cors');
const port = 3000
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// middlewares
app.use(cors());
app.use(express.json());

const stripe = require("stripe")(process.env.STRIPE_SEC_KEY);

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
        const trainersCollection = db.collection('trainers');
        const paymentCollection = db.collection('payments');
        const newsLetterCollection = db.collection('newsLetter');

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


        // admin verification
        const adminVerification = async (req, res, next) => {
            try {
                const firebaseEmail = req?.firebaseEmail;
                const query = { email: firebaseEmail };
                const user = await usersCollection.findOne(query);
                if (user.role !== 'admin') {
                    return res.status(403).send({ message: 'Forbidden Access' })
                }
                next()
            } catch (error) {
                res.status(500).send({ message: error.message })
            }
        }

        // trainer verification
        const trainerVerificaiton = async (req, res, next) => {
            try {
                const firebaseEmail = req?.firebaseEmail;
                const query = { email: firebaseEmail };
                const user = await usersCollection.findOne(query);
                if (user?.role !== 'trainer') {
                    return res.status(403).send({ message: 'Forbidden Access' })
                }
                next()
            } catch (error) {
                res.status(500).send({ message: error.message })
            }
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


        // get user role by email
        app.get("/users/:email/role", userVerification, async (req, res) => {
            try {
                const email = req.params.email;

                if (req.firebaseEmail !== email) {
                    return res.status(403).send({ message: "Forbidden Access" });
                }

                const user = await usersCollection.findOne({ email });
                if (!user) return res.status(404).send({ message: "User not found" });

                res.send({ role: user.role || "member" });
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: error.message });
            }
        });



        // get user 
        app.get("/users", userVerification, async (req, res) => {
            const firebaseEmail = req.firebaseEmail;
            const { userEmail } = req.query;

            try {
                if (firebaseEmail !== userEmail) {
                    return res.status(403).send({ message: 'Forbidden Access' })
                }
                const result = await usersCollection.findOne({ email: userEmail });
                res.send(result);
            }
            catch (error) {
                res.status(500).send({ message: error.message })
            }
        })


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
            const trainerEmail = trainer.email;
            if (firebaseEmail !== trainerEmail) {
                return res.status(403).send({ message: 'Forbidden Access' })
            }
            const query = { email: trainerEmail }
            const existsUser = await trainersCollection.findOne(query);
            if (existsUser) {
                return res.send({
                    success: false,
                    message: "Trainer already exists"
                });
            }

            const result = await trainersCollection.insertOne(trainer);
            res.send({
                success: true,
                message: "Applayed Successfully"
            });
        });


        // get trainers
        app.get("/trainers", async (req, res) => {
            const trainerId = req.query.trainerId || '';
            console.log(trainerId)
            try {
                if (trainerId) {
                    const trainers = await trainersCollection.findOne({ _id: new ObjectId(trainerId) });
                    return res.send(trainers)
                }
                const trainers = await trainersCollection.find().toArray();
                res.send(trainers);
            } catch (err) {
                res.status(500).json({ message: err.message });
            }
        });





        // payment creat instency
        app.post("/create-payment-intent", async (req, res) => {
            const { price } = req.body;
            console.log(price)
            // Create a PaymentIntent with the order amount and currency
            const paymentIntent = await stripe.paymentIntents.create({
                amount: price * 100,
                currency: "usd",
                automatic_payment_methods: {
                    enabled: true,
                },
            });

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });


        // save payement info
        app.post('/payments', async (req, res) => {
            try {
                const result = await paymentCollection.insertOne(req.body);
                res.send(result)
            } catch (error) {
                res.status(500).send({ message: error.message })
            }
        })



        // get newsletter subscribers
        app.get('/newsLetterSubscribers', userVerification , adminVerification , async(req , res) => {
            try {
                const result = await newsLetterCollection.find().toArray();
                res.send(result);
            } catch (error) {
                res.status(500).send({message: error.message})
            }
        })


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
