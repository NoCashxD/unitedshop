const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const svgCaptcha = require('svg-captcha');
const mysql = require('mysql');
const session = require('express-session');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { stringify } = require('csv-stringify');
const app = express();
const port = 5000;

app.set("trust proxy", 1);
// Middleware
app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: false,
}));


app.use(bodyParser.json());
const corsOptions = {
  origin: process.env.FRONTEND_URL, // Use the environment variable
  // origin: "http://localhost:3000",
  credentials: true
};

app.use(cors(corsOptions));

// Centralized error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err.stack);
  res.status(500).send({ message: 'Internal Server Error' });
});
app.use((req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.url}`);
  next();
});


// MySQL connection pooling
const db = mysql.createPool({
  connectionLimit: 10,
  host: 'server959.iseencloud.net',
  user: 'nocash_cassh',
  password: 'nocash_cassh',
  database: 'nocash_cassh',
  port: 3306,
  connectTimeout: 30000 // Increase timeout to 30 seconds
});


const handleDisconnect = () => {
  db.getConnection((err, connection) => {
    if (err) {
      console.error('Error connecting to MySQL:', err);
      setTimeout(handleDisconnect, 2000); // Attempt to reconnect after 2 seconds
    } else {
      console.log('Connected to MySQL database...');
      connection.release();
    }
  });

  db.on('error', (err) => {
    console.error('MySQL error:', err);
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
      handleDisconnect(); // Reconnect on connection loss
    } else {
      throw err;
    }
  });
};

handleDisconnect();
app.get('/test-db', (req, res) => {
    db.query('SELECT 1 + 1 AS result', (err, results) => {
        if (err) {
            console.error('Database Test Error:', err);
            return res.status(500).send({ message: 'Database Connection Failed' });
        }
        res.send({ message: 'Database Connected', result: results[0].result });
    });
});

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'viparraich@gmail.com',
    pass: 'nvle mnas ajmq dphr' // Your app password
  }
});


const sendMdsCodeEmail = (email, mdsCode) => {
  const mailOptions = {
    from: 'viparraich@gmail.com',
    to: email,
    subject: 'Your MDS Code',
    text: `Thank you for registering. Your MDS code is: ${mdsCode} kindly save it for future login`
  };

  return transporter.sendMail(mailOptions);
};
function generateTransactionId() {
  return crypto.randomBytes(6).toString('base64').replace(/[+/=]/g, '').substring(0, 8);
}
// owners email
// Add this route to server.js

app.post('/api/preorder', (req, res) => {
  const {
    city,
    state,
    level,
    country,
    brand,
    bin,
    bases,
    bankName,
    zip,
    minValue,
    maxValue
  } = req.body;

  const mailOptions = {
    from: 'viparraich@gmail.com',
    to: 'viparraich@gmail.com', // Replace with owner's email
    subject: 'New Preorder Request',
    text: `Preorder request from ${userid}:
    City: ${city}
    State: ${state}
    Level: ${level}
    Country: ${country}
    Brand: ${brand}
    BIN: ${bin}
    Bases: ${bases}
    Bank Name: ${bankName}
    Zip: ${zip}
    Min Price: ${minValue}
    Max Price: ${maxValue}`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending email:', error);
      res.status(500).send({ message: 'Failed to send preorder request' });
    } else {
      console.log('Email sent:', info.response);
      res.status(200).send({ message: 'Preorder request sent successfully' });
    }
  });
});


app.get('/api/captcha', (req, res) => {
  const captchaOptions = {
    ignoreChars: '0o1i',
    background: '#ffffff'
  };
  const captcha = svgCaptcha.create(captchaOptions);
  req.session.captcha = captcha.text.toLowerCase();
  console.log('CAPTCHA text stored in session:', req.session.captcha, req.session); // Debug line
  res.type('svg');
  res.status(200).send(captcha.data);
});


app.post('/api/signup', (req, res) => {
  const { username, password, email } = req.body;

  // Check if the username or email already exists
  const checkSql = 'SELECT * FROM users WHERE username = ? OR email = ?';
  db.query(checkSql, [username, email], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).send({ message: 'Database error' });
    }

    if (results.length > 0) {
      return res.status(409).send({ message: 'Username or email already in use' });
    }

      const insertSql = 'INSERT INTO users (username, password, email) VALUES (?, ?, ?)';
      db.query(insertSql, [username, password, email], (err, results) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).send({ message: 'Database error' });
        }
        res.status(200).send({ message: 'Signup successful', role: 'user' });
      });
    });
  });


// Login route
app.post('/api/login', (req, res) => {
  const { username, password, captcha } = req.body;
  console.log('Received CAPTCHA:', captcha); // Debug line
  console.log('Stored CAPTCHA:', req.session.captcha); // Debug line

  if (!req.session.captcha || captcha.toLowerCase() !== req.session.captcha) {
    console.log('Invalid CAPTCHA:', captcha, req.session.captcha);
    return res.status(400).send({ message: 'Invalid CAPTCHA' });
  }

  const sql = 'SELECT * FROM users WHERE username = ? AND password = ?';
  db.query(sql, [username, password], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).send(err);
    }

    if (results.length > 0) {
      req.session.username = username;
      console.log(results);

      res.status(200).send({
        message: 'Login successful',
        redirectTo: '/billing',
        username: results[0].username,
        role: results[0].role
      });
    } else {
      res.status(401).send({ message: 'Invalid credentials' });
    }
  });
});

// Data route for fetching graph data
app.get('/api/data', (req, res) => {
  const sql = 'SELECT cvv, ssn, checker, floods FROM transaction';

  db.query(sql, (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).send(err);
    }

    const graphData = results.map(row => ({
      cvv: row.cvv,
      ssn: row.ssn,
      checker: row.checker,
      floods: row.floods
    }));

    res.status(200).send(graphData);
  });
});
app.get('/api/balance', (req, res) => {
  const { username } = req.query;
  if (!username) {
    return res.status(401).send({ message: 'User not authorized' });
  }


  db.query('SELECT balance FROM users WHERE username = ?', [username], (err, results) => {
    if (err) {
      console.error('Database query error:', err);
      return res.status(500).send({ message: 'Failed to fetch balance' });
    }

    if (results.length === 0) {
      return res.status(404).send({ message: 'User not found' });
    }

    res.send({ balance: results[0].balance });
  });
});
app.get('/api/checks', (req, res) => {
  const { username } = req.query;

  if (!username) {
    return res.status(401).send({ message: 'User not authorized' });
  }

  const query = 'SELECT access FROM users WHERE username = ?';
  db.query(query, [username], (err, results) => {
    if (err) {
      console.error('Database query error:', err);
      return res.status(500).send({ message: 'Failed to fetch access' });
    }

    if (results.length === 0) {
      return res.status(404).send({ message: 'User not found' });
    }

    // Assuming 'access' is a field in the users table
    const access = results[0].access; 
    res.send({ access });
  });
});

app.post('/api/admin/users/update', (req, res) => {
  const { username, balance, role, access } = req.body;  // Destructure from req.body
  console.log(req.body, "data");

  // Correct SQL syntax for update query
  const query = `UPDATE users SET balance = ?, role = ?, access = ? WHERE username = ?`;
  
  db.query(query, [balance, role, access, username], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).send({ message: 'Failed to update user' });
    }

    if (results.affectedRows === 0) {
      return res.status(404).send({ message: 'User not found' });
    }

    res.send({ message: 'User updated successfully' });
  });
});
app.post('/api/submit-transaction', (req, res) => {
  const { transactionId, username } = req.body; // Access the username from session

  if (!username) {
    return res.status(401).send({ message: 'User not authorized' });
  }
  const mailOptions = {
    from: 'viparraich@gmail.com',
    to: 'viparraich@gmail.com',
    subject: 'Transaction Details',
    text: `Transaction ID: ${transactionId}\nUsername: ${username}`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending email:', error);
      return res.status(500).send({ message: 'Failed to send email' });
    }
    res.status(200).send({ message: 'Email sent successfully' });
  });
});
app.post('/api/submit-seller', (req, res) => {
  const { transactionId, username } = req.body; // Access the username from session

  if (!username) {
    return res.status(401).send({ message: 'User not authorized' });
  }
  const mailOptions = {
    from: 'viparraich@gmail.com',
    to: 'viparraich@gmail.com',
    subject: 'Sellers Details',


  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending email:', error);
      return res.status(500).send({ message: 'Failed to send email' });
    }
    res.status(200).send({ message: 'Email sent successfully' });
  });
});
app.get('/api/graph-data', (req, res) => {
  const query = 'SELECT day, activity FROM user_activity';
  db.query(query, (err, results) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.json(results);
      console.log("home session", req.session);

    }
  });
});

app.get('/api/cities', (req, res) => {
  const query = 'SELECT DISTINCT city FROM credit_card';
  db.query(query, (err, results) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.json(results);
      console.log("credit session", req.session);
    }
  });
});
app.get('/api/banks', (req, res) => {
  const query = 'SELECT DISTINCT bankname FROM credit_card';
  db.query(query, (err, results) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.json(results);
    }
  });
});
app.get('/api/country', (req, res) => {
  const query = 'SELECT DISTINCT country FROM credit_card';
  db.query(query, (err, results) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.json(results);
    }
  });
});
app.get('/api/level', (req, res) => {
  const query = 'SELECT DISTINCT level FROM credit_card';
  db.query(query, (err, results) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.json(results);
    }
  });
});
app.get('/api/brand', (req, res) => {
  const query = 'SELECT DISTINCT brand FROM credit_card';
  db.query(query, (err, results) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.json(results);
    }
  });
});
app.get('/api/state', (req, res) => {
  const query = 'SELECT DISTINCT state FROM credit_card';
  db.query(query, (err, results) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.json(results);
    }
  });
});
app.get('/api/base', (req, res) => {
  const query = 'SELECT DISTINCT base FROM credit_card';
  db.query(query, (err, results) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.json(results);
    }
  });
});
app.get('/api/details', (req, res) => {
  const { username } = req.query;
  if (!username) {
    return res.status(401).send({ message: 'User not authorized' });
  }
  const query = 'SELECT * FROM transaction where user = ?';
  db.query(query,[username], (err, results) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.json(results);
    }
  });
});
app.get('/api/getusers', (req, res) => {
  const query = 'SELECT DISTINCT username FROM users';
  db.query(query, (err, results) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.json(results);
      console.log(results);

    }
  });
});

app.post('/api/cards', (req, res) => {
  const { city, state, level, country, bin, bases, bankName, zip, minprice, maxprice, types, hcvv, wcc, waddr, wemail, wphone, wdob, fullz } = req.body;

  // Start building the query
  let query = 'SELECT * FROM credit_card WHERE user IS NULL';
  const queryParams = [];

  if (bin) {
    query += ' AND bin = ?';
    queryParams.push(bin);
  }
  if (state) {
    query += ' AND state = ?';
    queryParams.push(state);
  }
  if (types) {
    query += ' AND type = ?';
    queryParams.push(types);
  }
  if (city) {
    query += ' AND city = ?';
    queryParams.push(city);
  }
  if (zip) {
    query += ' AND zip = ?';
    queryParams.push(zip);
  }
  if (bases) {
    query += ' AND base = ?';
    queryParams.push(bases);
  }
  if (bankName) {
    query += ' AND bankname = ?';
    queryParams.push(bankName);
  }
  if (level) {
    query += ' AND level = ?';
    queryParams.push(level);
  }
  if (country) {
    query += ' AND country = ?';
    queryParams.push(country);
  }
  if (minprice || maxprice) {
    query += ' AND price BETWEEN ? AND ?';
    queryParams.push(minprice || 0); // Default to 0 if minprice is not provided
    queryParams.push(maxprice || 100); // Default to Infinity if maxprice is not provided
  }
  if (hcvv) {
    query += ' AND cvv IS NOT NULL';
  }
  if (wcc) {
    query += ' AND cvv IS NULL';
  }
  if (waddr) {
    query += ' AND addr IS NOT NULL';

  }
  if (wemail) {
    query += ' AND email IS NOT NULL';

  }
  if (wphone) {
    query += ' AND phone IS NOT NULL';

  }
  if (wdob) {
    query += ' AND dob IS NOT NULL';

  }
  if (fullz) {
    query += ' AND bin IS NOT NULL AND cvv IS NOT NULL AND yymm IS NOT NULL AND country IS NOT NULL AND bank IS NOT NULL AND level IS NOT NULL AND type IS NOT NULL AND holder IS NOT NULL AND city IS NOT NULL AND state IS NOT NULL AND zip IS NOT NULL AND base IS NOT NULL AND price IS NOT NULL AND addr IS NOT NULL AND email IS NOT NULL AND phone IS NOT NULL AND dob IS NOT NULL AND mmn IS NOT NULL AND sortCode IS NOT NULL AND ip IS NOT NULL AND checker IS NOT NULL';
  }


  // Log the constructed query and parameters
  console.log('Constructed Query:', query);
  console.log('Query Parameters:', queryParams);

  // Execute the query
  db.query(query, queryParams, (err, results) => {
    if (err) {
      console.error('Error executing query:', err.message);
      return res.status(500).json({ error: err.message });
    }

    console.log('Query Results:', results);

    res.json(results);
  });
});

app.get('/api/admin/users', (req, res) => {
  const query = `select * from users`
  db.query(query, (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});
app.get('/api/card/cart', (req, res) => {
  const { username } = req.query;

  if (!username) {
    return res.status(401).send({ message: 'User not authorized' });
  }
  let query = 'SELECT * FROM cart WHERE user = ?';
  db.query(query, [username], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});
app.get('/api/card/order', (req, res) => {
  const { username } = req.query;

  if (!username) {
    return res.status(401).send({ message: 'User not authorized' });
  }
  let query = 'SELECT * FROM orders WHERE user = ? AND type = ?';
  db.query(query, [username, "credit card"], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: err.message });
    }
    console.log(results)
    res.json(results);
  });  
});
app.get('/api/sock/order', (req, res) => {
  const { username } = req.query;

  if (!username) {
    return res.status(401).send({ message: 'User not authorized' });
  }
  let query = 'SELECT * FROM orders WHERE user = ? and type = ?';
  db.query(query, [username,"sock"], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});
app.get('/api/billing/history', (req, res) => {
  const { username } = req.query;

  if (!username) {
    return res.status(401).send({ message: 'User not authorized' });
  }
  let query = 'SELECT * FROM transaction WHERE user = ?';
  db.query(query, [username,"sock"], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});
app.get('/api/ticket', (req, res) => {
  const { username } = req.query;

  if (!username) {
    return res.status(401).send({ message: 'User not authorized' });
  }
  let query = 'SELECT * FROM ticket WHERE user = ?';
  db.query(query, [username,"sock"], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});
app.post("/api/addcart", (req, res) => {
  const { username, info } = req.body; // Destructure both 'username' and 'info' from req.body
  let item = info[0];
  console.log(item, "data");

  if (!username) {
    return res.status(401).send({ message: 'User not authorized' });
  }

  // Query to check if the item already exists in the cart for the user
  const checkQuery = `
    SELECT * FROM cart WHERE bin = ? AND cvv = ? AND user = ?
  `;

  const checkValues = [item.bin, item.cvv, username];

  db.query(checkQuery, checkValues, (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: err.message });
    }

    // If item already exists, send a message
    if (results.length > 0) {
      return res.status(400).json({ message: 'Item already in cart' });
    }

    // If item doesn't exist, proceed to insert it into the cart
    const insertQuery = `
      INSERT INTO cart(
        bin, cvv, exp, country, bank, level, type, holderName,
        city, state, zip, base, price, addr, email, phone, dob, sortCode,
        ip, checker, additionalInfo, ccnum, user
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;

    const insertValues = [
      item.bin,        // `bin`
      item.cvv,        // `cvv`
      item.yymm,       // `yymm`
      item.country,    // `country`
      item.bank,       // `bank`
      item.level,      // `level`
      item.type,       // `type`
      item.holder,     // `holder`
      item.city,       // `city`
      item.state,      // `state`
      item.zip,        // `zip`
      item.base,       // `base`
      item.price,      // `price`
      item.addr,       // `addr`
      item.email,      // `email`
      item.phone,      // `phone`
      item.dob,        // `dob`  
      item.sortCode,   // `sortCode`
      item.ip,         // `ip`
      item.checker,    // `checker`
      item.additionalInfo, // `additionalInfo`
      item.ccnum,      // `ccnum`
      username
    ];

    db.query(insertQuery, insertValues, (err, results) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Item added to cart successfully', results });
    });
  });
});

app.post("/api/order/remove", (req, res) => {
  const { username, info } = req.body; // Destructure both 'username' and 'info' from req.body
  let item = info[0];
  console.log(item, "data");

  if (!username) {
    return res.status(401).send({ message: 'User not authorized' });
  }

  // Updated query to include all columns in the 'cart' table
  const query = `
  DELETE FROM orders WHERE code = ? and user = ?;`;

  // Values to be inserted into the table
  const values = [// `additionalInfo`
    item.code,// `bins`
    username
  ];

  db.query(query, values, (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Item removed from order successfully', results });
  });
});
app.post("/api/cart/remove", (req, res) => {
  const { username, info } = req.body; // Destructure both 'username' and 'info' from req.body
  let item = info[0];
  console.log(item, "data");

  if (!username) {
    return res.status(401).send({ message: 'User not authorized' });
  }

  // Updated query to include all columns in the 'cart' table
  const query = `
  DELETE FROM cart WHERE ccnum = ? and user = ?;`;

  // Values to be inserted into the table
  const values = [// `additionalInfo`
    item.ccnum,// `bins`
    username
  ];

  db.query(query, values, (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Item removed from cart successfully', results });
  });
});


app.post('/api/bins', (req, res) => {
  const { level, country, types, buyed, username, description } = req.body;

  if (!username) {
    return res.status(401).send({ message: 'User not authorized' });
  }

  if (buyed == true) { // Check if buyed is explicitly true
    let query = 'SELECT * FROM buyed WHERE bins = true AND user = ?';
    db.query(query, [username], (err, results) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: err.message });
      }
      res.json(results);
    });
  } else {
    let query = 'SELECT * FROM bins WHERE 1=1 AND user IS NULL ';


    if (level) query += ` AND level = '${level}'`;
    if (description) query += ` AND info = '${description}'`;
    if (country) query += ` AND country = '${country}'`;
    if (types) query += ` AND type = '${types}'`;


    // console.log('Constructed Query:', query); // Log the constructed query
    db.query(query, (err, results) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: err.message });
      }
      // console.log('Results:', results); // Log the results
      res.json(results);
    });
  }
});
app.post('/api/create/ticket', (req, res) => {
  const { subject, department, message, username } = req.body;

  if (!username) {
    return res.status(401).send({ message: 'User not authorized' });
  }

  const query = 'INSERT INTO ticket (subject, department, message, user, status, answered) VALUES (?, ?, ?, ?, "opened", "pending")';
  
  db.query(query, [subject, department, message, username], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: err.message });
    }

    const mailOptions = {
      from: 'viparraich@gmail.com',
      to: 'viparraich@gmail.com',
      subject: `Ticket Details: ${subject}`,
      text: `Username: ${username}\nDepartment: ${department}\nMessage: ${message}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Error sending email:', error);
        return res.status(500).send({ message: 'Ticket created but email failed to send' });
      }

      return res.status(200).json({
        message: 'Ticket created and email sent successfully' // assuming `results` contains the ID of the inserted ticket
      });
    });
  });
});



app.post('/api/Proxies', (req, res) => {
  const { continent, state, city, zip, minprice, maxprice } = req.body;

  let query = 'SELECT * FROM proxies WHERE 1=1';

  if (continent) query += ` AND continent = '${continent}'`;
  if (state) query += ` AND state = '${state}'`;
  if (city) query += ` AND city = '${city}'`;
  if (zip) query += ` AND zip = '${zip}'`;
  if (minprice !== undefined && maxprice !== undefined) {
    query += ` AND price BETWEEN '${minprice}' AND '${maxprice}'`;
  }

  // console.log('Constructed Query:', query); // Log the constructed query
  db.query(query, (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: err.message });
    }
    // console.log('Results:', results); // Log the results
    res.json(results);
  });

});


app.post('/api/purchase', (req, res) => {
  const { username, info } = req.body;

  if (!username) {
    return res.status(401).send({ message: 'User not authorized' });
  }
  console.log(info, "data");



  if (!info || !Array.isArray(info)) {
    return res.status(400).send({ message: 'Invalid request data' });
  }

  db.getConnection((err, connection) => {
    if (err) {
      console.error('Database connection error:', err);
      return res.status(500).send({ message: 'Database connection failed' });
    }

    connection.beginTransaction(async (err) => {
      if (err) {
        console.error('Transaction initiation error:', err);
        connection.release();
        return res.status(500).send({ message: 'Transaction initiation failed' });
      }

      try {
        // Define queries
        const insertBuyedQuery = `
              INSERT INTO buyed (
 bin, cvv, yymm, country, bank, level, type, holder,
  city, state, zip, base, price, addr, email, phone, dob, mmn, sortCode,
  ip, checker, additionalInfo,ccnum, user, code,bins
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?,0);
`;

        const updateBalanceQuery = `UPDATE users SET balance = balance - ? WHERE username = ?`;
        const updateCreditCardQuery = `UPDATE credit_card SET user = ? WHERE ccnum = ?`;
        const getUserRoleQuery = `SELECT role FROM users WHERE username = ?`;
        const updateorder = `insert into orders (code,quantity,total_price,user,type,cc_num) values(?,1,?,?,?,?)`;
        const updatetransaction = `insert into transaction (code,method,memo,fee,amount,pay,befor,after,status,user) values(?,'CCS',?,0,?,?,?,?,'paid',?)`
        // Calculate total price
        const updatecart = `DELETE FROM cart WHERE user = ? AND ccnum = ?`;
        let totalPrice = 0;
        let cc_num = 0;
        let type = 'credit card';
        const code =   generateTransactionId();
        const values = info.map(item => {
          totalPrice += item.price; // Sum up total price
          cc_num = item.ccnum;
          
          return [
            item.bin,        // `bin`
            item.cvv,        // `cvv`
            item.exp,       // `yymm`
            item.country,    // `country`
            item.bank,       // `bank`
            item.level,      // `level`
            item.type,       // `type`
            item.holderName,     // `holder`
            item.city,       // `city`
            item.state,      // `state`
            item.zip,        // `zip`
            item.base,       // `base`
            item.price,      // `price`
            item.addr,       // `addr`
            item.email,      // `email`
            item.phone,      // `phone`
            item.dob,        // `dob`
            item.mmn,        // `mmn`
            item.sortCode,   // `sortCode`
            item.ip,         // `ip`
            item.checker,    // `checker`
            item.additionalInfo, // `additionalInfo`
            item.ccnum,// `bins`
            username,
            code
          ];
        });

        // Check if any item has already been bought
        const checkCardQuery = `SELECT user FROM credit_card WHERE ccnum = ?`;
        const cardUsers = await Promise.all(values.map(valueSet =>
          new Promise((resolve, reject) => {
            connection.query(checkCardQuery, [valueSet[23]], (error, results) => {
              if (error) {
                reject(error);
              } else {
                resolve(results);
              }
            });
          })
        ));

        for (const cardUser of cardUsers) {
          if (cardUser[0] && cardUser[0].user !== null) {
            return res.status(400).send({ message: 'One or more cards have already been bought' });
          }
        }

        // Get user role
        const [userRole] = await new Promise((resolve, reject) => {
          connection.query(getUserRoleQuery, [username], (error, results) => {
            if (error) reject(error);
            resolve(results);
          });
        });

        // Apply discount if user role is 'reseller'
        if (userRole.role === 'reseller') {
          totalPrice *= 0.5; // Apply 50% discount
        }

        // Insert purchase records
        await Promise.all(values.map(valueSet =>
          new Promise((resolve, reject) => {
            connection.query(insertBuyedQuery, valueSet, (error) => {
              if (error) {
                reject(error);
              } else {
                resolve();
              }
            });
          })
        ));

        // Check balance and update if sufficient
        const [user] = await new Promise((resolve, reject) => {
          connection.query('SELECT balance FROM users WHERE username = ?', [username], (error, results) => {
            if (error) reject(error);
            resolve(results);
          });
        });

        if (user.balance < totalPrice) {
          throw new Error('Insufficient balance');
        }

        // Update user balance
       
        await new Promise((resolve, reject) => {
          connection.query(updatetransaction, [code,"CCS || PURCHASE 1pcs", totalPrice,totalPrice,user.balance,user.balance - totalPrice, username], (error) => {
            if (error) reject(error);
            resolve();
          });
        });
        await new Promise((resolve, reject) => {
          connection.query(updateBalanceQuery, [totalPrice, username], (error) => {
            if (error) reject(error);
            resolve();
          });
        });
        // Update credit card
        await new Promise((resolve, reject) => {
          connection.query(updateCreditCardQuery, [username, cc_num], (error) => {
            if (error) reject(error);
            resolve();
          });
        });
        await new Promise((resolve, reject) => {
          connection.query(updatecart, [username, cc_num], (error) => {
            if (error) reject(error);
            resolve();
          });
        });
        await new Promise((resolve, reject) => {
          connection.query(updateorder, [code, totalPrice, username, type, cc_num], (error) => {
            if (error) reject(error);
            resolve();
          });
        }); 
        // Commit transaction
        connection.commit((err) => {
          if (err) {
            console.error('Transaction commit error:', err);
            return connection.rollback(() => {
              res.status(500).send({ message: 'Transaction commit failed' });
            });
          }

          res.send({ message: 'Transaction successful' });
        });
      } catch (error) {
        console.error('Transaction error:', error);
        connection.rollback(() => {
          res.status(500).send({ message: error.message });
        });
      } finally {
        connection.release();
      }
    });
  });
});

app.post('/api/purchase_bins', (req, res) => {
  const { username, info } = req.body;

  console.log(req.body, username);

  if (!username) {
    return res.status(401).send({ message: 'User not authorized' });
  }

  if (!info || !Array.isArray(info)) {
    return res.status(400).send({ message: 'Invalid request data' });
  }

  db.getConnection((err, connection) => {
    if (err) {
      console.error('Database connection error:', err);
      return res.status(500).send({ message: 'Database connection failed' });
    }

    connection.beginTransaction(async (err) => {
      if (err) {
        console.error('Transaction error:', err);
        connection.release();
        return res.status(500).send({ message: 'Transaction failed' });
      }

      try {
        // Define queries
        const insertBuyedQuery = `
          INSERT INTO buyed (
            bin, country, price, level, brand, type, bins, user, info
          ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?);
        `;

        const updateBalanceQuery = `UPDATE users SET balance = balance - ? WHERE username = ?`;
        const updateCreditCardQuery = `UPDATE bins SET user = ? WHERE bin = ?`;
        const updateTransactionCardQuery = `insert into transaction (code,method,memo,fee,amount,pay,befor,after,status,user) values(?,'BIN',?,0,?,?,?,?,'paid',?)`;

        // Calculate total price
        let totalPrice = 0;
        const type = "bin";
        const code =   generateTransactionId();
        const values = info.map(item => {
          totalPrice += item.price; // Sum up total price
          return [
            item.bin, item.country, item.price, item.level, item.brand, item.type, username, item.info
          ];
        });

        // Check if any bin has already been bought
        const checkBinQuery = `SELECT user FROM bins WHERE bin = ?`;
        const binUsers = await Promise.all(values.map(valueSet =>
          new Promise((resolve, reject) => {
            connection.query(checkBinQuery, [valueSet[0]], (error, results) => {
              if (error) {
                reject(error);
              } else {
                resolve(results);
              }
            });
          })
        ));

        for (const binUser of binUsers) {
          if (binUser[0] && binUser[0].user !== null) {
            return res.status(400).send({ message: 'One or more bins have already been bought' });
          }
        }

        // Apply discount if user role is 'reseller'
        const [userRole] = await new Promise((resolve, reject) => {
          connection.query('SELECT role FROM users WHERE username = ?', [username], (error, results) => {
            if (error) reject(error);
            resolve(results);
          });
        });

        if (userRole.role === 'reseller') {
          totalPrice *= 0.5; // Apply 50% discount
        }

        // Insert purchase records
        await Promise.all(values.map(valueSet =>
          new Promise((resolve, reject) => {
            connection.query(insertBuyedQuery, valueSet, (error) => {
              if (error) {
                reject(error);
              } else {
                resolve();
              }
            });
          })
        ));

        // Check balance and update if sufficient
        const [user] = await new Promise((resolve, reject) => {
          connection.query('SELECT balance FROM users WHERE username = ?', [username], (error, results) => {
            if (error) reject(error);
            resolve(results);
          });
        });

        if (user.balance < totalPrice) {
          throw new Error('Insufficient balance');
        }

        // Update user balance
        await new Promise((resolve, reject) => {
          connection.query(updateBalanceQuery, [totalPrice, username], (error) => {
            if (error) reject(error);
            resolve();
          });
        });

        // Update bins
        await Promise.all(info.map(item =>
          new Promise((resolve, reject) => {
            connection.query(updateCreditCardQuery, [username, item.bin], (error) => {
              if (error) reject(error);
              resolve();
            });
          })
        ));

        // Record the transaction
        await new Promise((resolve, reject) => {
          connection.query(updateTransactionCardQuery, [code,"BIN || PURCHASE 1pcs", totalPrice,totalPrice,user.balance,user.balance - totalPrice, username], (error) => {
            if (error) reject(error);
            resolve();
          });
        });

        // Commit transaction
        connection.commit((err) => {
          if (err) {
            console.error('Transaction commit error:', err);
            return connection.rollback(() => {
              res.status(500).send({ message: 'Transaction failed' });
            });
          }

          res.send({ message: 'Transaction successful' });
        });
      } catch (error) {
        console.error('Transaction error:', error);
        connection.rollback(() => {
          res.status(500).send({ message: error.message });
        });
      } finally {
        connection.release();
      }
    });
  });
});


app.post('/api/purchase_proxies', (req, res) => {
  const { items, username } = req.body;


  if (!username) {
    return res.status(401).send({ message: 'User not authorized' });
  }


  if (!items || !Array.isArray(items)) {
    return res.status(400).send({ message: 'Invalid request data' });
  }

  db.getConnection((err, connection) => {
    if (err) {
      console.error('Database connection error:', err);
      return res.status(500).send({ message: 'Database connection failed' });
    }

    connection.beginTransaction(async (err) => {
      if (err) {
        console.error('Transaction error:', err);
        connection.release();
        return res.status(500).send({ message: 'Transaction failed' });
      }

      try {
        // Define queries
        const insertBuyedQuery = `
          INSERT INTO buyed (
            id, , country, price, level, brand, type,bins
          ) VALUES (?,?,?,?,?,?,?,1);
        `;

        const updateBalanceQuery = `UPDATE users SET balance = balance - ? WHERE username = ?`;

        // Calculate total price
        let totalPrice = 0;
        const values = items.map(item => {
          totalPrice += item.price; // Sum up total price
          return [
            item.id, item.bin, item.country, item.price, item.level, item.brand, item.type
          ];
        });

        // Insert purchase records
        await Promise.all(values.map(valueSet =>
          new Promise((resolve, reject) => {
            connection.query(insertBuyedQuery, valueSet, (error) => {
              if (error) {
                reject(error);
              } else {
                resolve();
              }
            });
          })
        ));

        // Check balance and update if sufficient
        const [user] = await new Promise((resolve, reject) => {
          connection.query('SELECT balance FROM users WHERE username = ?', [username], (error, results) => {
            if (error) reject(error);
            resolve(results);
          });
        });

        if (user.balance < totalPrice) {
          throw new Error('Insufficient balance');
        }

        // Update user balance
        await new Promise((resolve, reject) => {
          connection.query(updateBalanceQuery, [totalPrice, username], (error) => {
            if (error) reject(error);
            resolve();
          });
        });

        // Commit transaction
        connection.commit((err) => {
          if (err) {
            console.error('Transaction commit error:', err);
            return connection.rollback(() => {
              res.status(500).send({ message: 'Transaction failed' });
            });
          }

          res.send({ message: 'Transaction successful' });
        });
      } catch (error) {
        console.error('Transaction error:', error);
        connection.rollback(() => {
          res.status(500).send({ message: error.message });
        });
      } finally {
        connection.release();
      }
    });
  });
});

app.get('/api/view/:id', (req, res) => {
  const username = req.query.username;
  const id = req.params.id;

  console.log(username,id);
  

  if (!username) {
    return res.status(401).send({ message: 'User not authorized' });
  }

  const transactionQuery = 'SELECT * FROM ticket WHERE id = ?';
  db.query(transactionQuery, [id], (err, results) => {
    if (err) {
      console.error('Error fetching ticket: ', err);
      return res.status(500).send({ message: 'Internal Server Error' });
    }

    if (results.length === 0) {
      return res.status(404).send({ message: 'Ticket not found' });
    }

    // If ticket is found, send the data
    return res.status(200).send(results[0]);
  });
});
app.get('/api/order/view/:id', (req, res) => {
  const username = req.query.username;
  const id = req.params.id;

  console.log(username,id);
  

  if (!username) {
    return res.status(401).send({ message: 'User not authorized' });
  }

  const transactionQuery = 'SELECT * FROM buyed WHERE code = ?';
  db.query(transactionQuery, [id], (err, results) => {
    if (err) {
      console.error('Error fetching ticket: ', err);
      return res.status(500).send({ message: 'Internal Server Error' });
    }

    if (results.length === 0) {
      return res.status(404).send({ message: 'details not found' });
    }

    // If ticket is found, send the data
    return res.status(200).send(results[0]);
  });
});

app.get('/api/orders/:id', (req, res) => {
  const username = req.query.username;
  const transactionId = req.params.id;

  if (!username) {
    return res.status(401).send({ message: 'User not authorized' });
  }

  const transactionQuery = 'SELECT * FROM orders WHERE code = ?';
  db.query(transactionQuery, [transactionId], (err, results) => {
    if (err) {
      console.error('Error fetching transaction:', err);
      return res.status(500).send('Internal Server Error');
    }

    if (results.length === 0) {
      return res.status(404).send('Order not found');
    }

    const transaction = results[0];

    if (transaction.type === 'credit card') {
      const creditCardQuery = 'SELECT * FROM buyed WHERE code = ? AND user = ? AND bins = 0';
      db.query(creditCardQuery, [transactionId, username], (err, cardResults) => {
        if (err) {
          console.error('Error fetching credit card info:', err);
          return res.status(500).send('Internal Server Error');
        }

        if (cardResults.length === 0) {
          return res.status(404).send('Credit card information not found');
        }

        const card = cardResults[0]; // Assuming you get one record

        // Prepare CSV data
        const csvData = [
          [
            card.ccnum || '',
            card.yymm || '',
            card.cvv || '',
            card.holder || '',
            card.addr || '',
            card.city || '',
            card.state || '',
            card.zip || '',
            card.phone || ''
          ]
        ];

        // Convert CSV data to string
        stringify(csvData, { header: false }, (err, output) => {
          if (err) {
            console.error('Error generating CSV:', err);
            return res.status(500).send('Internal Server Error');
          }

          // Set headers for CSV file download
          res.setHeader('Content-Disposition', `attachment; filename=order_${transactionId}.csv`);
          res.setHeader('Content-Type', 'text/csv');

          // Send CSV data
          res.send(output);
        });
      });
    } else {
      res.status(400).send('Transaction type is not credit card');
    }
  });
});


// Route to get user details
app.get('/api/profile', (req, res) => {
  const user = req.query.username;
  const sql = 'SELECT username, email, created_at FROM users WHERE username = ?';

  db.query(sql, [user], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).send(err);
    }

    if (results.length > 0) {
      res.status(200).send(results[0]);
    } else {
      res.status(404).send({ message: 'User not found' });
    }
  });
});

// Route to update the password
app.post('/api/profile/password', (req, res) => {

  const { currentPassword, newPassword, username } = req.body;

  // Check current password
  const checkSql = 'SELECT password FROM users WHERE username = ?';
  db.query(checkSql, [username], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).send(err);
    }

    if (results.length === 0 || results[0].password !== currentPassword) {
      return res.status(401).send({ message: 'Current password is incorrect' });
    }

    // Update to new password
    const updateSql = 'UPDATE users SET password = ? WHERE username = ?';
    db.query(updateSql, [newPassword, username], (err, updateResults) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).send(err);
      }

      res.status(200).send({ message: 'Password updated successfully' });
    });
  });
});
app.get('/api/checker', (req, res) => {
  const username = req.query.username;
  const sql = 'SELECT * FROM buyed WHERE user = ?';

  db.query(sql, [username], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).send(err);
    }

    if (results.length > 0) {
      res.status(200).send(results[0]);
      // console.log(results);

    } else {
      res.status(404).send({ message: 'User not found' });
    }
  });
});
app.post('/api/send-email', (req, res) => {
  const emailData = req.body;

  const mailOptions = {
    from: 'viparraich@gmail.com',
    to: 'viparraich@gmail.com',  // Recipient's email address
    subject: 'Credit Details', // Subject of the email
    text: `Here are the details of the Credit Card For Checking For User ${emailData.username}:
    
    BIN: ${emailData.bin}
    Exp Date: ${emailData.time}
    First Name: ${emailData.firstName}
    Country: ${emailData.country}
    State: ${emailData.state}
    City: ${emailData.city}
    ZIP: ${emailData.zip}
    Info: ${emailData.info}
    Address: ${emailData.address}
    BIN Info: ${emailData.binInfo}
    Base: ${emailData.base}
    Valid Percent: ${emailData.validPercent}
    Refundable: ${emailData.refundable ? 'Yes' : 'No'}
    Price: ${emailData.price}$`,
  };
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending email:', error);
      return res.status(500).send({ message: 'Failed to send email' });
    }
    console.log('Email sent: ' + info.response);
    res.status(200).send({ message: 'Email sent successfully!' });
  });
});

app.post("/api/add-card", (req, res) => {
  const {
    ccnum,
    cvv,
    exp,
    bin,
    country,
    state,
    city,
    zip,
    bankName,
    level,
    brand,
    types,
    bases,
    price,
    address,
    binfo, email, phone, dob, name, sort_code,
    ip,
    checker
  } = req.body;

  

  const sql = `
    INSERT INTO credit_card (
      ccnum, cvv, yymm, bin, country, state, city, zip,
      bank, level, type, base, price,addr,additionalInfo, email, phone, dob,holder, mmn ,sortCode	,ip,checker,user
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?, ?,?, ?,?,'VCLUB',?,?,?,NULL)
  `;
  db.query(sql, [
    ccnum, cvv, exp, bin, country, state, city, zip,
    bankName, level, types, bases, price, address, binfo, email, phone, dob, name,sort_code,ip,checker
  ], (err, result) => {
    if (err) {
      console.error("Error inserting card data into the database:", err);
      return res.status(500).json({ message: "Error inserting card data into the database" });
    }
    res.status(200).json({ message: "Card data added successfully" });
    console.log(result);

  });
});

// Route to add BIN data
app.post("/api/add-bin", (req, res) => {
  const {
    bin,
    country,
    types,
    level,
    price,
    brand,
    description
  } = req.body;

  const sql = `
    INSERT INTO bins (
      bin, country, level, type,brand,info, price,user
    ) VALUES (?, ?, ?, ?, ?,?,?,NULL)
  `;
  db.query(sql, [
    bin, country, level, types,brand,description, price
  ], (err, result) => {
    if (err) {
      console.error("Error inserting BIN data into the database:", err);
      return res.status(500).json({ message: "Error inserting BIN data into the database" });
    }
    res.status(200).json({ message: "BIN data added successfully" });
  });
});
app.post('/api/add-seller', (req, res) => {
  let { user, role, price } = req.body;


  // Validate input
  if (!user || role === undefined || price === undefined) {
    return res.status(400).send({ message: 'Username, new role, and a valid balance are required' });
  }
  if (isNaN(price)) {
    return res.status(400).send({ message: 'Invalid balance value' });
  }
  const updateRoleQuery = `
    UPDATE users
    SET role = ?
    WHERE username = ?;
  `;

  const updateBalanceQuery = `
    UPDATE users
    SET balance = balance - ?
    WHERE username = ?;
  `;

  db.getConnection((err, connection) => {
    if (err) {
      console.error('Database connection error:', err);
      return res.status(500).send({ message: 'Database connection failed' });
    }

    connection.beginTransaction(async (err) => {
      if (err) {
        console.error('Transaction initiation error:', err);
        connection.release();
        return res.status(500).send({ message: 'Transaction initiation failed' });
      }

      try {
        // Log the queries and parameters
        console.log('Executing updateRoleQuery:', updateRoleQuery);
        console.log('With parameters:', [role, user]);

        await new Promise((resolve, reject) => {
          connection.query(updateRoleQuery, [role, user], (error) => {
            if (error) {
              console.error('Error updating role:', error.message);
              reject(error);
            } else {
              resolve();
            }
          });
        });
        const [users] = await new Promise((resolve, reject) => {
          connection.query('SELECT balance FROM users WHERE username = ?', [user], (error, results) => {
            if (error) reject(error);
            resolve(results);
          });
        });

        if (users.balance < price) {
          throw new Error('Insufficient balance');
        }
        await new Promise((resolve, reject) => {
          connection.query(updateBalanceQuery, [price, user], (error) => {
            if (error) {
              console.error('Error updating balance:', error.message);
              reject(error);
            } else {
              resolve();
            }
          });
        });

        connection.commit((err) => {
          if (err) {
            console.error('Commit error:', err);
            connection.rollback(() => {
              res.status(500).send({ message: 'Transaction commit failed' });
            });
          } else {
            res.send({ message: 'User role and balance updated successfully' });
          }
        });
      } catch (error) {
        console.error('Transaction error:', error.message);
        connection.rollback(() => {
          res.status(500).send({ message: error.message });
        });
      } finally {
        connection.release();
      }
    });
  });
});
app.get('/api/payments', (req, res) => {
  const user = req.query.username;
  const sql = 'SELECT * FROM payment WHERE username = ?';
  console.log(`Fetching payments for user: ${user}`);

  db.query(sql, [user], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }

    // Always return an array, even if empty
    res.status(200).json(results);
  });
});


// app.listen(port, () => {
//   console.log(`Server is running on port: ${port}`);
// });
module.exports = app;
