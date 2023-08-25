/**
 * Using Prisma as ORM, and express router to create the endpoint for POST request
 */

import { Request, Response, Router } from "express";
import { Prisma, PrismaClient, Contact } from "@prisma/client";
const prisma: PrismaClient = new PrismaClient();
const router: Router = Router();

/// ----------------------------------------------------------------------------------------------------------------------------------------------

type requestFields = {
  email?: string;
  phoneNumber?: any;
};

type responseFields = {
  primaryContactId?: number;
  emails?: string[];
  phoneNumbers?: string[];
  secondaryContactIds?: number[];
};

/// ----------------------------------------------------------------------------------------------------------------------------------------------

// Point a primary contact and liked secondary contacts to a new primary contact
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

// Generate a response object
const generateResponseObject = (contact: any) => {
  let response: responseFields = {};

  let emails = new Set<string>();
  let phoneNumbers = new Set<string>();
  let secondaryContactIds = new Set<number>();

  let relatedContacts: any = [];
  let primaryContact: any;

  if (contact.linkPrecedence === "primary") primaryContact = contact;
  else if (contact.linkPrecedence === "secondary")
    primaryContact = contact?.linkedTo;

  const { id, email, phoneNumber } = primaryContact;

  response.primaryContactId = id;
  if (email) emails.add(email);
  if (phoneNumber) phoneNumbers.add(phoneNumber);
  response.primaryContactId = id;
  relatedContacts = primaryContact?.linkedSecondaryContacts;

  if (relatedContacts.length > 0) {
    for (const contact of relatedContacts) {
      const { id, email, phoneNumber } = contact;
      if (email) emails.add(email);
      if (phoneNumber) phoneNumbers.add(phoneNumber);
      secondaryContactIds.add(id);
    }
  }

  response.emails = Array.from(emails);
  response.phoneNumbers = Array.from(phoneNumbers);
  response.secondaryContactIds = Array.from(secondaryContactIds);

  return response;
};

/// ----------------------------------------------------------------------------------------------------------------------------------------------

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

/// ----------------------------------------------------------------------------------------------------------------------------------------------

// Defining the endpoint below

router.post("/", async (req: Request, res: Response) => {
  let { email, phoneNumber }: requestFields = req.body;

  if (email) email = email.trim();
  if (phoneNumber) phoneNumber = phoneNumber.toString().trim();

  let response: responseFields = {};

  // Fetch matching contacts based on email and/or phoneNumber
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

  // Matching contacts found
  if (matchingContacts.length > 0) {
    let allSortedPrimaryContacts: Contact[] = [];

    // Get all primary contacts (some nested within secondary contacts). Sort with creation Date
    for (const contact of matchingContacts) {
      let primaryContact: any;
      if (contact.linkPrecedence === "primary") primaryContact = contact;
      else primaryContact = contact.linkedTo;
      if (
        !allSortedPrimaryContacts.some(
          (contact2: Contact) => contact2.id === primaryContact.id
        )
      ) {
        allSortedPrimaryContacts.push(primaryContact);
      }
    }
    allSortedPrimaryContacts.sort(
      (a: Contact, b: Contact) => a.createdAt.getTime() - b.createdAt.getTime()
    );

    if (email && phoneNumber) {
      const newPrimaryContactId = allSortedPrimaryContacts[0]?.id;

      // Convert primary contact into secondary
      for (const primaryContact of allSortedPrimaryContacts.slice(1)) {
        await updateContactLinkPrecedence(primaryContact, newPrimaryContactId);
      }

      let responseContact: Contact | null = allSortedPrimaryContacts[0];

      //Check for new email/phoneNumber, if true create secondary contact
      let contactExists =
        matchingContacts.some((contact) => contact.email === email) &&
        matchingContacts.some(
          (contact) => contact.phoneNumber === phoneNumber?.toString()
        );

      if (!contactExists) {
        let secondaryContactData = {
          email,
          phoneNumber: phoneNumber?.toString(),
          linkPrecedence: "secondary",
          linkedTo: { connect: { id: newPrimaryContactId } },
        };
        responseContact = await prisma.contact.create({
          data: secondaryContactData,
          include: contactInclude,
        });
      } else {
        responseContact = await prisma.contact.findUnique({
          where: { id: newPrimaryContactId },
          include: contactInclude,
        });
      }

      response = generateResponseObject(responseContact);
      res.status(200).json({ contact: response });
    } else {
      response = generateResponseObject(allSortedPrimaryContacts[0]);
      res.status(200).json({ contact: response });
    }
  }

  // Create new contact if no matching contacts are found
  else if (matchingContacts?.length == 0 && (email || phoneNumber)) {
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
    if (createContact.email) response.emails = [createContact.email];
    if (createContact.phoneNumber)
      response.phoneNumbers = [createContact.phoneNumber];
    res.status(200).json({ contact: response });
  } else {
    res.status(400).json({ error: "Internal server error!" });
  }
});

module.exports = router;
