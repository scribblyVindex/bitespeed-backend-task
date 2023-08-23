import express, { Express, Request, Response, Router } from "express";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma: PrismaClient = new PrismaClient();

const router: Router = Router();

interface requestFields {
  email?: string;
  phoneNumber?: number;
}

interface responseFields {
  primaryContactId?: number;
  emails?: string[];
  phoneNumbers?: string[];
  secondaryContactIds?: number[];
}

router.post("/", async (req: Request, res: Response) => {
  const { email, phoneNumber }: requestFields = req.body;

  const contactSelect: Prisma.ContactSelect = {
    id: true,
    email: true,
    phoneNumber: true,
    linkedId: true,
    linkPrecedence: true,
    deletedAt: true,
    createdAt: true,
    updatedAt: true,
  };

  const contacts = await prisma.contact.findMany({
    where: {
      OR: [
        {
          email: {
            equals: email,
          },
        },
        {
          phoneNumber: {
            equals: phoneNumber?.toString(),
          },
        },
      ],
    },
    orderBy: {
      createdAt: "asc",
    },
    select: contactSelect,
  });
});

module.exports = router;
