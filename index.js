require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const app = express();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
// middleWares
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gom6gdt.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// jwt middleware
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "forbidden access" });
    }

    req.decoded = decoded;
    next();
  });
};

// Create a MongoClient with a MongoClientOptions object to set the Stable API version

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });

    const donationsCollection = client
      .db("Assignment-12")
      .collection("Donations");
    const favoritesCollection = client
      .db("Assignment-12")
      .collection("Favorites");
    const usersCollection = client.db("Assignment-12").collection("Users");
    const requestsCollection = client
      .db("Assignment-12")
      .collection("Requests");
    const reviewsCollection = client.db("Assignment-12").collection("Reviews");

    // jwt
    // JWT route
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "7d", // token expires in 7 days
      });
      res.send({ token });
    });

    app.get("/featured-donations", async (req, res) => {
      const cursor = donationsCollection.find();
      const result = await cursor.limit(6).toArray();
      res.send(result);
    });
    app.get("/donation/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await donationsCollection.findOne(query);
      res.send(result);
    });

    app.post("/favorites", verifyToken, async (req, res) => {
      const donationId = req.body.donationId;
      const email = req.decoded.email;

      if (!email || !donationId) {
        return res
          .status(400)
          .send({ message: "email and donationId are required" });
      }

      const exists = await favoritesCollection.findOne({
        userId: email,
        donationId,
      });
      if (exists) {
        return res.status(409).send({ message: "Favorite already exists" });
      }

      const result = await favoritesCollection.insertOne({
        userId: email,
        donationId,
      });

      res.status(201).send(result);
    });

    app.get("/favorites/:userId", async (req, res) => {
      const userId = req.params.userId;
      if (req.decoded.email !== userId) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const favorites = await favoritesCollection.find({ userId }).toArray();

      const detailedFavorites = await Promise.all(
        favorites.map(async (fav) => {
          const donation = await donationsCollection.findOne({
            _id: new ObjectId(fav.donationId),
          });
          return {
            ...fav,
            ...donation,
            donationId: fav.donationId, // keep donationId separately
          };
        })
      );

      res.send(detailedFavorites);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const existingUser = await usersCollection.findOne({ email: user.email });

      if (existingUser) {
        return res.status(200).send(existingUser);
      }
      const result = await usersCollection.insertOne(user);
      res.status(201).send(result);
    });
    app.get("/users/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const user = await usersCollection.findOne({ email });
      res.send(user);
    });

    // Request apis
    app.post("/requests", async (req, res) => {
      const request = req.body;
      request.status = "Pending";
      const result = await requestsCollection.insertOne(request);
      res.send(result);
    });

    app.get("/requests/:donationId", async (req, res) => {
      const donationId = req.params.donationId;
      const result = await requestsCollection.find({ donationId }).toArray();
      res.send(result);
    });

    app.patch("/requests/:id", async (req, res) => {
      const id = req.params.id;
      const updateDoc = {
        $set: req.body,
      };
      const result = await requestsCollection.updateOne(
        { _id: new ObjectId(id) },
        updateDoc
      );
      res.send(result);
    });

    // reviews api
    app.post("/reviews", async (req, res) => {
      const review = req.body;
      review.createdAt = new Date();
      const result = await reviewsCollection.insertOne(review);
      res.send(result);
    });
    app.get("/reviews-by-user/:email", async (req, res) => {
      const email = req.params.email;
      const result = await reviewsCollection.find({ email }).toArray();
      res.send(result);
    });
    app.delete("/reviews/:id", async (req, res) => {
      const id = req.params.id;
      const result = await reviewsCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);
app.get("/", (req, res) => {
  res.send("Assignment-12 is running!");
});

app.listen(port, () => {
  console.log(`Assignment on  port ${port}`);
});
