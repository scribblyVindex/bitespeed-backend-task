import express, { Express, Request, Response, Router } from "express";
import { Prisma, PrismaClient, Contact } from "@prisma/client";
const prisma: PrismaClient = new PrismaClient();
const router: Router = Router();

/// ----------------------------------------------------------------------------------------------------------------------------------------------
type requestFields = {
  email?: string;
  phoneNumber?: number;
};

type responseFields = {
  primaryContactId?: number;
  emails?: string[];
  phoneNumbers?: string[];
  secondaryContactIds?: number[];
};

/// ----------------------------------------------------------------------------------------------------------------------------------------------
// Utility functions
const updateContactLinkPrecedence = async (
  contact: Contact,
  newPrimaryContactId?: number
) => {
  const updatedContact = await prisma.contact.update({
    where: { id: contact.id },
    data: {
      linkPrecedence: "secondary",
      linkedTo: { connect: { id: newPrimaryContactId } },
    },
    include: { linkedSecondaryContacts: true },
  });

  // Connect linkedSecondaryContacts to the new primary contact
  const updatePromises = updatedContact.linkedSecondaryContacts.map(
    (secContact) =>
      prisma.contact.update({
        where: { id: secContact.id },
        data: {
          linkedTo: { connect: { id: newPrimaryContactId } },
        },
      })
  );

  await Promise.all(updatePromises);
};

//
const generateResponseObject = (contact: any) => {
  let response: responseFields = {};

  let emails = new Set<string>();
  let phoneNumbers = new Set<string>();
  let secondaryContactIds = new Set<number>();

  if (contact.linkPrecedence === "primary") {
    const { id, email, phoneNumber } = contact;
    response.primaryContactId = id;
    if (email) emails.add(email);
    if (phoneNumber) phoneNumbers.add(phoneNumber);
    let relatedContacts = contact.linkedSecondaryContacts;
    if (relatedContacts.length > 0) {
      for (const contact of relatedContacts) {
        const { id, email, phoneNumber } = contact;
        if (email) emails.add(email);
        if (phoneNumber) phoneNumbers.add(phoneNumber);
        secondaryContactIds.add(id);
      }
    }
  } else if (contact.linkPrecedence === "secondary") {
    let primaryContact = contact?.linkedTo;
    const { id, email, phoneNumber } = primaryContact;
    response.primaryContactId = id;
    emails.add(email);
    phoneNumbers.add(phoneNumber);
    response.primaryContactId = id;
    let relatedContacts = primaryContact?.linkedSecondaryContacts;
    if (relatedContacts.length > 0) {
      for (const contact of relatedContacts) {
        const { id, email, phoneNumber } = contact;
        if (email) emails.add(email);
        if (phoneNumber) phoneNumbers.add(phoneNumber);
        secondaryContactIds.add(id);
      }
    }
  }

  response.emails = Array.from(emails);
  response.phoneNumbers = Array.from(phoneNumbers);
  response.secondaryContactIds = Array.from(secondaryContactIds);

  return response;
};

// Include statement for fetching contacts
const contactInclude: Prisma.ContactInclude = {
  linkedSecondaryContacts: {
    orderBy: {
      createdAt: "asc",
    },
    include: {
      linkedTo: true,
    },
  },
  linkedTo: {
    include: {
      linkedSecondaryContacts: true,
    },
  },
};

router.post("/", async (req: Request, res: Response) => {
  const { email, phoneNumber }: requestFields = req.body;

  let response: responseFields = {};

  const matchingContacts = await prisma.contact.findMany({
    where: {
      OR: [
        { email: { equals: email } },
        { phoneNumber: { equals: phoneNumber?.toString() } },
      ],
    },
    orderBy: {
      createdAt: "asc",
    },
    include: contactInclude,
  });

  if (matchingContacts.length > 0) {
    let exactMatch = matchingContacts.find(
      (contact) =>
        contact.email === email &&
        contact.phoneNumber === phoneNumber?.toString()
    );

    if (exactMatch) {
      response = generateResponseObject(exactMatch);
      res.status(200).json({ contact: response });
    } else {
      let allSortedPrimaryContacts: Contact[] = [];

      for (const contact of matchingContacts) {
        let contactToPush: any;
        if (contact.linkPrecedence === "primary") contactToPush = contact;
        else contactToPush = contact.linkedTo;
        if (
          !allSortedPrimaryContacts.some(
            (contact2: Contact) => contact2.id === contactToPush.id
          )
        ) {
          allSortedPrimaryContacts.push(contactToPush);
        }
      }
      allSortedPrimaryContacts.sort(
        (a: Contact, b: Contact) =>
          a.createdAt.getTime() - b.createdAt.getTime()
      );

      if (email && phoneNumber && allSortedPrimaryContacts.length > 1) {
        const newPrimaryContactId = allSortedPrimaryContacts[0]?.id;

        for (const primaryContact of allSortedPrimaryContacts.slice(1)) {
          await updateContactLinkPrecedence(
            primaryContact,
            newPrimaryContactId
          );
        }
        const updatedPrimaryContact = await prisma.contact.findUnique({
          where: { id: newPrimaryContactId },
          include: contactInclude,
        });

        response = generateResponseObject(updatedPrimaryContact);
        res.status(200).json({ contact: response });
      } else {
        response = generateResponseObject(allSortedPrimaryContacts[0]);
        res.status(200).json({ contact: response });
      }
    }
  }

  // Create new contact if no matching contacts are found
  else if (matchingContacts?.length == 0 && email && phoneNumber) {
    let data: Prisma.ContactCreateInput = {
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
    res.status(200).json({ contact: response });
  } else {
    res.status(400).json({ error: "Internal server error!" });
  }
});

module.exports = router;
