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

  let response: responseFields = {};

  const contacts = await prisma.contact.findMany({
    where: {
      OR: [
        { email: { equals: email } },
        { phoneNumber: { equals: phoneNumber?.toString() } },
      ],
    },
    orderBy: {
      createdAt: "asc",
    },
    select: contactSelect,
  });

  if (contacts.length == 0 && (email || phoneNumber)) {
    let data: any = {
      linkPrecedence: "primary",
    };
    if (email) data.email = email;
    if (phoneNumber) data.phoneNumber = phoneNumber.toString();
    const createContact = await prisma.contact.create({
      data: data,
    });

    response = {
      primaryContactId: createContact!.id!,
      secondaryContactIds: [],
    };
    if (createContact.phoneNumber)
      response.phoneNumbers = [createContact.phoneNumber];
    if (createContact.email) response.emails = [createContact.email];
  }

  if (response.primaryContactId) res.status(200).json({ contact: response });
});

module.exports = router;
