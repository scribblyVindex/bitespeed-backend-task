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
    const primaryContact = contacts[0];
    response.primaryContactId = primaryContact.id;
    let emails = new Set<string>();
    let phoneNumbers = new Set<string>();
    let secondaryContactIds = new Set<number>();
    // If a common field found and if both fields are not the same, create a new secondary contact
    if (
      !contacts.find(
        (contact) =>
          contact.email === email &&
          contact.phoneNumber === phoneNumber?.toString()
      )
    ) {
      // Primary contact becomes secondary contact
      if (email && phoneNumber) {
        let commonPrimaryContacts = contacts.filter(
          (contact) => contact.linkPrecedence === "primary"
        );
        if (commonPrimaryContacts.length > 1) {
          for (const contact of commonPrimaryContacts.slice(1)) {
            let { id } = contact;
            let modifiedContact = await prisma.contact.update({
              where: { id: id },
              data: {
                linkPrecedence: "secondary",
                linkedId: commonPrimaryContacts[0].id,
              },
            });
            secondaryContactIds.add(id);
          }
        }

        // Create secondary contact
        let data: any = {
          linkPrecedence: "secondary",
          linkedId: primaryContact.id,
        };
        if (email) data.email = email;
        if (phoneNumber) data.phoneNumber = phoneNumber.toString();
        const createSecondaryContact = await prisma.contact.create({
          data: data,
        });
        if (createSecondaryContact.email)
          emails.add(createSecondaryContact.email);
        if (createSecondaryContact.phoneNumber)
          phoneNumbers.add(createSecondaryContact.phoneNumber);
        secondaryContactIds.add(createSecondaryContact.id);
      }
    }

    // Regardless of creation of secondary contact
    for (const contact of contacts) {
      let { id, email, phoneNumber, linkPrecedence } = contact;
      if (linkPrecedence === "secondary") secondaryContactIds.add(id);
      if (email) emails.add(email);
      if (phoneNumber) phoneNumbers.add(phoneNumber);
    }

    response.emails = Array.from(emails);
    response.phoneNumbers = Array.from(phoneNumbers);
    response.secondaryContactIds = Array.from(secondaryContactIds);
  }

  // Create new contact if no matching contacts are found
  if (contacts.length == 0 && email && phoneNumber) {
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
  else res.status(400).json({ error: "Internal server error!" });
});

module.exports = router;
