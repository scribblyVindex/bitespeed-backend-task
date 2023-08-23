import express, { Express, Request, Response, Router } from "express";
import { PrismaClient } from "@prisma/client";

const prisma: PrismaClient = new PrismaClient();

const router: Router = Router();

router.post("/", async (req: Request, res: Response) => {
  const { email, phoneNumber } = req.body;

  const contact = await prisma.contact.create({ data: req.body });
  res.json(contact);
});

module.exports = router;
