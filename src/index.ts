import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";

dotenv.config();
const app: Express = express();

app.use(express.json());

const port = process.env.PORT || "3000";

app.use("/identify", require("./routes/identify"));

app.listen(port, () => {
  console.log(`Server Running at ${port} 🚀`);
});
