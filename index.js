require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require('cors');
const socketIo = require('socket.io');
const port = process.env.PORT || 7000;
const app = express();

app.use(cors({
    origin: ['http://localhost:5173', 'https://to-do-list-220c9.web.app'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type'],
}));

app.use(express.json());

const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

const io = socketIo(server, {
    cors: {
        origin: ['http://localhost:5173', 'https://to-do-list-220c9.web.app'],
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type'],
    }
});



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.kriop.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
        const taskCollection = client.db('ToDo').collection('tasks');

        // Listen to Change Streams for the 'tasks' collection
        const changeStream = taskCollection.watch();

        changeStream.on('change', (change) => {
            if (change.operationType === 'insert') {
                // Task was inserted
                io.emit('taskAdded', { id: change.fullDocument._id, ...change.fullDocument });
            } else if (change.operationType === 'update') {
                // Task was updated
                const updatedTask = change.updateDescription.updatedFields;
                io.emit('taskUpdated', { id: change.documentKey._id, updatedTask });
            } else if (change.operationType === 'delete') {
                // Task was deleted
                io.emit('taskDeleted', { id: change.documentKey._id });
            }
        });

        // Routes for handling tasks
        app.post('/tasks', async (req, res) => {
            const task = req.body;
            task.timeStamp = new Date().toString();
            const result = await taskCollection.insertOne(task);
            io.emit('taskAdded', { id: result.insertedId, ...task });
            res.send(result);
        });

        app.get('/tasks', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const result = await taskCollection.find(query).toArray();
            res.send(result);
        });

        app.delete('/tasks/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await taskCollection.deleteOne(query);
            res.send(result)
            console.log(result)
        })
        app.put("/task/:id", async (req, res) => {
            const { id } = req.params;
            const { name, description } = req.body;

            // Check if the task exists in the database
            const task = await taskCollection.findOne({ _id: new ObjectId(id) });
            if (!task) {
                return res.status(404).json({ message: "Task not found" });
            }

            // Prepare the updated task object
            const updatedTask = {};
            if (name) updatedTask.name = name;   // Update name only if it's provided
            if (description) updatedTask.description = description;   // Update description only if it's provided

            // Update the task in the database
            const result = await taskCollection.updateOne(
                { _id: new ObjectId(id) },  // Find the task by its ID
                { $set: updatedTask }       // Update the fields that are provided
            );

            // Send the response back
            res.send(result);
        });


        app.put('/tasks/:id', async (req, res) => {
            const id = req.params.id;
            const updatedTask = req.body;

            const result = await taskCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { category: updatedTask.category } }
            );
            if (result.matchedCount > 0) {
                io.emit('taskUpdated', { id, updatedTask });
            }
            res.send(result);
        });

        // Connect the client to the server
        await client.connect();
        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");

    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello, World!');
});
