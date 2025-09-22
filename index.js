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
    const transactionsCollection = client
      .db("Assignment-12")
      .collection("Transactions");

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
    //  Admin Middleware
  const verifyAdmin = async (req, res, next) => {
  try {
    const email = req.decoded?.email; // <- change from req.user?.email
    if (!email) {
      return res.status(401).json({ error: "Unauthorized: No email found" });
    }

    const user = await usersCollection.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.role !== "admin") {
      return res.status(403).json({ error: "Forbidden: Admins only" });
    }

    req.userRole = user.role; // optional
    next();
  } catch (err) {
    console.error("Admin verification failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};


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
        { expiresIn: "30d" }
      );

      res.send({ token });
    });
    // User's Api
    app.post("/users", async (req, res) => {
      try {
        const { email, name, photoURL, role = "user" } = req.body;

        if (!email) {
          return res.status(400).json({ error: "Email is required" });
        }

        const existingUser = await usersCollection.findOne({ email });

        if (existingUser) {
          await usersCollection.updateOne(
            { email },
            { $set: { last_log_in: new Date().toISOString() } }
          );

          return res.status(200).json({
            message: "User already exists, last login updated",
            userId: existingUser._id,
          });
        }

        // Create new user
        const user = {
          name,
          email,
          photoURL,
          role,
          created_at: new Date().toISOString(),
          last_log_in: new Date().toISOString(),
        };

        const result = await usersCollection.insertOne(user);
        res.status(201).json({
          success: true,
          message: "New user created",
          userId: result.insertedId,
        });
      } catch (err) {
        console.error("Error saving user:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
  const { search } = req.query;
  const query = search
    ? {
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      }
    : {};

  const users = await usersCollection.find(query).toArray();
  res.send(users);
});

    // Make a user admin
    app.patch(
      "/users/:id/make-admin",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const { id } = req.params;

          const result = await usersCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { role: "admin" } }
          );

          if (result.matchedCount === 0) {
            return res.status(404).json({ error: "User not found" });
          }

          res.json({ success: true, message: "User is now an admin" });
        } catch (err) {
          console.error("Error making admin:", err);
          res.status(500).json({ error: "Failed to make admin" });
        }
      }
    );
    // Remove admin (set back to user)
    app.patch(
      "/users/:id/remove-admin",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const { id } = req.params;

          const result = await usersCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { role: "user" } }
          );

          if (result.matchedCount === 0) {
            return res.status(404).json({ error: "User not found" });
          }

          res.json({
            success: true,
            message: "Admin removed, set back to user",
          });
        } catch (err) {
          console.error("Error removing admin:", err);
          res.status(500).json({ error: "Failed to remove admin" });
        }
      }
    );

    // Make Charity
    app.patch(
      "/users/:id/make-charity",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const { id } = req.params;
          const result = await usersCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { role: "charity" } }
          );
          if (result.matchedCount === 0)
            return res.status(404).json({ error: "User not found" });
          res.json({ success: true, message: "User role set to charity" });
        } catch (err) {
          console.error("Error making charity:", err);
          res.status(500).json({ error: "Failed to set charity role" });
        }
      }
    );

    // Remove Charity (set back to user)
    app.patch(
      "/users/:id/remove-charity",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const { id } = req.params;
          const result = await usersCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { role: "user" } }
          );
          if (result.matchedCount === 0)
            return res.status(404).json({ error: "User not found" });
          res.json({
            success: true,
            message: "Charity role removed, set back to user",
          });
        } catch (err) {
          console.error("Error removing charity:", err);
          res.status(500).json({ error: "Failed to remove charity role" });
        }
      }
    );

    // Make Restaurant
    app.patch(
      "/users/:id/make-restaurant",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const { id } = req.params;
          const result = await usersCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { role: "restaurant" } }
          );
          if (result.matchedCount === 0)
            return res.status(404).json({ error: "User not found" });
          res.json({ success: true, message: "User role set to restaurant" });
        } catch (err) {
          console.error("Error making restaurant:", err);
          res.status(500).json({ error: "Failed to set restaurant role" });
        }
      }
    );

    // Remove Restaurant (set back to user)
    app.patch(
      "/users/:id/remove-restaurant",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const { id } = req.params;
          const result = await usersCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { role: "user" } }
          );
          if (result.matchedCount === 0)
            return res.status(404).json({ error: "User not found" });
          res.json({
            success: true,
            message: "Restaurant role removed, set back to user",
          });
        } catch (err) {
          console.error("Error removing restaurant:", err);
          res.status(500).json({ error: "Failed to remove restaurant role" });
        }
      }
    );

    app.get("/users/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const user = await usersCollection.findOne({ email });
      res.send(user);
    });

    app.get("/users/role/:email", verifyToken, async (req, res) => {
      try {
        const { email } = req.params;
        const user = await usersCollection.findOne({ email });
        if (!user) {
          return res.status(404).json({ role: "user" }); // default to user
        }
        res.json({ role: user.role || "user" });
      } catch (err) {
        console.error("Error fetching role:", err);
        res.status(500).json({ error: "Failed to fetch role" });
      }
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
      const favorite = req.body;
      const result = await favoritesCollection.insertOne(favorite);
      res.send(result);
    });

    // Get favorites for a user
    app.get("/favorites/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const favorites = await favoritesCollection
        .find({ userEmail: email })
        .toArray();

      const detailedFavorites = await Promise.all(
        favorites.map(async (fav) => {
          const donation = await donationsCollection.findOne({
            _id: new ObjectId(fav.donationId),
          });
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
        ...req.body,
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
    app.get(
      "/requests/by-donation/:donationId",
      verifyToken,
      async (req, res) => {
        const donationId = req.params.donationId;
        const email = req.query.email; // charity email
        const result = await requestsCollection
          .find({ donationId, charityEmail: email })
          .toArray();
        res.send(result);
      }
    );

    // Add review
    app.post("/reviews", verifyToken, async (req, res) => {
      const review = {
        ...req.body,
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
      const {
        email,
        organizationName,
        missionStatement,
        transactionId,
        amount,
      } = req.body;

      const existingRequest = await requestsCollection.findOne({
        email,
        status: { $in: ["Pending", "Approved"] },
        purpose: "Charity Role Request",
      });

      if (existingRequest) {
        return res
          .status(400)
          .send({ message: "You already have a pending or approved request." });
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

    // Payment related apis::

    // Create Payment Intent
    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const { amount } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).send({ message: "Invalid amount" });
      }

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount * 100,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (err) {
        console.error("Stripe error:", err);
        res.status(500).send({ error: err.message });
      }
    });

    // Save Transaction (after successful payment)
    app.post("/transactions", verifyToken, async (req, res) => {
      const { email, amount, transactionId, purpose } = req.body;

      if (!email || !transactionId) {
        return res.status(400).send({ message: "Missing required fields" });
      }

      const transaction = {
        email,
        amount,
        transactionId,
        purpose: purpose || "General",
        status: "succeeded",
        createdAt: new Date(),
      };

      const result = await transactionsCollection.insertOne(transaction);
      res.send(result);
    });

    // Get user's transactions (history)
    app.get("/transactions/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      const transactions = await transactionsCollection
        .find({ email })
        .sort({ createdAt: -1 })
        .toArray();

      res.send(transactions);
    });

    // Admin: Get all transactions
    app.get("/transactions", verifyToken, async (req, res) => {
      const transactions = await transactionsCollection
        .find()
        .sort({ createdAt: -1 })
        .toArray();

      res.send(transactions);
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
