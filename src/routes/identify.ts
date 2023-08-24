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

  // Aggregate and return emails and phoneNumbers from all matching contacts
  if (contacts.length > 0) {
    let emails: string[] = [];
    let phoneNumbers: string[] = [];
    let secondaryContactIds: number[] = [];
    for (let i = 1; i < contacts.length; ++i) {
      let { id, email, phoneNumber } = contacts[i];
      secondaryContactIds.push(id);
      if (email) emails.push(email);
      if (phoneNumber) phoneNumbers.push(phoneNumber);
    }
    response.primaryContactId = contacts[0].id;
    response.emails = emails;
    response.phoneNumbers = phoneNumbers;
    response.secondaryContactIds = secondaryContactIds;
  }

  // Create new contact if no matching contacts are found
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

  // Create new secondary contact if a common email/phoneNumber is found

  if (response.primaryContactId) res.status(200).json({ contact: response });
  else res.status(400).json({ error: "Internal server error!" });
});

module.exports = router;
