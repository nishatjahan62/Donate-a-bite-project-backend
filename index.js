require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
// middleWares
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gom6gdt.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// jwt middleware
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send("Unauthorized access");
  }

  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) return res.status(403).send({ message: "Forbidden access" });
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

    app.post("/jwt", async (req, res) => {
      const userEmail = req.body.email;

      const user = await usersCollection.findOne({ email: userEmail });
      if (!user) {
        return res.status(404).send({ message: "User not found" });
      }

      const token = jwt.sign(
        { email: userEmail, role: user.role || "user" },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "7d" }
      );

      res.send({ token });
    });
// User's Api
    app.post("/users", verifyToken, async (req, res) => {
      console.log("User POST route hit:", req.body); // 👈 Add this

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

    // Save to favorites
app.post("/favorites", verifyToken, async (req, res) => {
  const favorite = req.body; // { donationId, userEmail }
  const result = await favoritesCollection.insertOne(favorite);
  res.send(result);
});

// Get favorites for a user
app.get("/favorites/:email", verifyToken, async (req, res) => {
  const email = req.params.email;
  const favorites = await favoritesCollection.find({ userEmail: email }).toArray();

  const detailedFavorites = await Promise.all(
    favorites.map(async (fav) => {
      const donation = await donationsCollection.findOne({ _id: new ObjectId(fav.donationId) });
      return {
        ...fav,
        donationTitle: donation?.title,
        donationImage: donation?.image,
        restaurantName: donation?.restaurantName,
        location: donation?.location,
        status: donation?.status,
        quantity: donation?.quantity,
      };
    })
  );

  res.send(detailedFavorites);
});

// Create request
app.post("/requests", verifyToken, async (req, res) => {
  const request = {
    ...req.body, // donationId, donationTitle, restaurantName, charityName, charityEmail, description, pickupTime
    status: "Pending",
    createdAt: new Date(),
  };
  const result = await requestsCollection.insertOne(request);
  res.send(result);
});

// Update request status (Accept / Picked Up)
app.patch("/requests/:id", verifyToken, async (req, res) => {
  const id = req.params.id;
  const { status } = req.body;
  const filter = { _id: new ObjectId(id) };
  const updateDoc = {
    $set: { status },
  };
  const result = await requestsCollection.updateOne(filter, updateDoc);
  res.send(result);
});
app.get("/requests/by-donation/:donationId", verifyToken, async (req, res) => {
  const donationId = req.params.donationId;
  const email = req.query.email; // charity email
  const result = await requestsCollection
    .find({ donationId, charityEmail: email })
    .toArray();
  res.send(result);
});

// Add review
app.post("/reviews", verifyToken, async (req, res) => {
  const review = {
    ...req.body, // donationId, reviewerName, description, rating
    createdAt: new Date(),
  };
  const result = await reviewsCollection.insertOne(review);
  res.send(result);
});

// Get reviews for a donation
app.get("/reviews/:donationId", async (req, res) => {
  const donationId = req.params.donationId;
  const result = await reviewsCollection.find({ donationId }).toArray();
  res.send(result);
});

app.post("/charity-request", verifyToken, async (req, res) => {
  const { email, organizationName, missionStatement, transactionId, amount } = req.body;

  const existingRequest = await requestsCollection.findOne({
    email,
    status: { $in: ["Pending", "Approved"] },
    purpose: "Charity Role Request",
  });

  if (existingRequest) {
    return res.status(400).send({ message: "You already have a pending or approved request." });
  }

  const result = await requestsCollection.insertOne({
    email,
    organizationName,
    missionStatement,
    transactionId,
    amount,
    status: "Pending",
    purpose: "Charity Role Request",
    createdAt: new Date(),
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
