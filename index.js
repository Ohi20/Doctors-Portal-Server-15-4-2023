const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.dag5uvw.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: 'UnAuthorized access' });
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: 'Forbidden access' })
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    await client.connect();
    const servicesCollection = client.db('doctors-portal').collection('services');
    const bookingCollection = client.db('doctors-portal').collection('bookings');
    const userCollection = client.db('doctors-portal').collection('users');

    app.get('/service', async (req, res) => {
      const query = {};
      const cursor = servicesCollection.find(query);
      const services = await cursor.toArray();
      res.send(services);
    });

    app.get('/user', verifyJWT, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    app.get('/admin/:email', async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email:email });
      const isAdmin = user.role === 'admin';
      res.send({ admin:isAdmin});
    })

    app.put('/user/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({email: requester});
      if(requesterAccount === 'admin'){
        const filter = { email: email };
        const updateDoc = {
          $set: { role: 'admin'},
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
      else{
        res.status(403).send({ message: 'forbidden' });
      }
    });
    
    app.put('/user/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ result: result, token: token });
    });
    // WARNING!!
    // This is not the proper way. Use mongodb aggregate lookup, pipeline , group etc.
    // j date a booking kora hoise shei date badde baki available date
    app.get('/available', async (req, res) => {
      const date = req.query.date;
      // step 1: get all services
      const services = await servicesCollection.find().toArray();
      // step 2: get the booking of that day
      const query = { date: date };
      const bookings = await bookingCollection.find(query).toArray();
      // step 3: for each service
      services.forEach((service) => {
        // step 4: find the booking for that service
        const serviceBookings = bookings.filter(booking => booking.treatment === service.name);
        // step 5: Select slots for service booking
        const bookedSlots = serviceBookings.map(book => book.slot);
        // step 6: Select those slots that are not in bookSlots
        const available = service.slots.filter(slot => !bookedSlots.includes(slot));
        // step 7: set available to slots to make it easier
        service.slots = available;

      })
      res.send(services);
    })

    // Api Naming Convention
    // app.get('/booking') - get all bookings or get more than one 
    // app.get('/booking/:id') - get a specific booking
    // app.post('/booking')- add a new booking
    // app.patch('/booking/:id') - upadate a specific booking/id
    // app.put('/booking/:id') - if user exists then update or insert user(upsert(update/insert))
    // app.delete('/booking/:id') - delete a specific booking/id

    app.get('/booking', verifyJWT, async (req, res) => {
      const patient = req.query.patient;
      const decodedEmail = req.decoded.email;
      if (patient === decodedEmail) {
        const query = { patient: patient };
        const bookings = await bookingCollection.find(query).toArray();
        return res.send(bookings);
      }
      else {
        return res.status(403).send({ message: 'Forbidden access' });
      }

    })

    app.post('/booking', async (req, res) => {
      const booking = req.body;
      const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
      const exists = await bookingCollection.findOne(query);
      if (exists) {
        return res.send({ success: false, booking: exists })
      }
      const result = await bookingCollection.insertOne(booking);
      return res.send({ success: true, result });
    })
  }
  finally {

  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Doctors listening to ${port}`)
})