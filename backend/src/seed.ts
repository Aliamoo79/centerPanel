import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

async function main() {
  const username = process.env.ADMIN_USERNAME ?? "admin";
  const password = process.env.ADMIN_PASSWORD ?? "admin";
  const sellerUsername = process.env.SELLER_USERNAME ?? "seller";
  const sellerPassword = process.env.SELLER_PASSWORD;

  const existing = await prisma.admin.findUnique({ where: { username } });
  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.admin.create({ data: { username, passwordHash, role: "ADMIN" } });
    console.log(`Created admin "${username}".`);
  } else {
    console.log(`Admin "${username}" already exists — skipping.`);
  }

  if (sellerPassword && sellerUsername !== username) {
    const seller = await prisma.admin.findUnique({ where: { username: sellerUsername } });
    if (!seller) {
      const passwordHash = await bcrypt.hash(sellerPassword, 10);
      await prisma.admin.create({ data: { username: sellerUsername, passwordHash, role: "SELLER" } });
      console.log(`Created seller account "${sellerUsername}".`);
    } else if (seller.role !== "SELLER") {
      await prisma.admin.update({ where: { id: seller.id }, data: { role: "SELLER" } });
      console.log(`Updated "${sellerUsername}" to seller role.`);
    } else {
      console.log(`Seller "${sellerUsername}" already exists — skipping.`);
    }
  } else {
    console.log("SELLER_PASSWORD is not configured; no seller account was created.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
