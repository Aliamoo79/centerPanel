import { prisma } from "../db";
import { AppError } from "../lib/errors";

export const GLOBAL_CREDIT_ACCOUNT_ID = "global";
export const PACKAGE_CODES = ["1M_1U", "1M_2U", "2M_1U", "2M_2U"] as const;
export type PackageCode = (typeof PACKAGE_CODES)[number];

export function packagePrice(account: {
  package1M1U: number;
  package1M2U: number;
  package2M1U: number;
  package2M2U: number;
}, code: PackageCode) {
  return {
    "1M_1U": account.package1M1U,
    "1M_2U": account.package1M2U,
    "2M_1U": account.package2M1U,
    "2M_2U": account.package2M2U,
  }[code];
}

export async function getCreditAccount() {
  return prisma.creditAccount.upsert({
    where: { id: GLOBAL_CREDIT_ACCOUNT_ID },
    create: { id: GLOBAL_CREDIT_ACCOUNT_ID },
    update: {},
  });
}

export async function chargeCredits(amount: number, userId: string, description: string) {
  if (!Number.isInteger(amount) || amount <= 0) throw new AppError("هزینه ساخت کاربر معتبر نیست");

  return prisma.$transaction(async (tx) => {
    await tx.creditAccount.upsert({
      where: { id: GLOBAL_CREDIT_ACCOUNT_ID },
      create: { id: GLOBAL_CREDIT_ACCOUNT_ID },
      update: {},
    });
    const updated = await tx.creditAccount.updateMany({
      where: { id: GLOBAL_CREDIT_ACCOUNT_ID, balance: { gte: amount } },
      data: { balance: { decrement: amount } },
    });
    if (updated.count !== 1) throw new AppError("اعتبار کافی نیست");

    await tx.creditTransaction.create({
      data: {
        amount: -amount,
        type: "USER_CREATION",
        description,
        userId,
        accountId: GLOBAL_CREDIT_ACCOUNT_ID,
      },
    });
    return tx.creditAccount.findUniqueOrThrow({ where: { id: GLOBAL_CREDIT_ACCOUNT_ID } });
  });
}

export async function addCredits(amount: number, description?: string) {
  if (!Number.isInteger(amount) || amount <= 0) throw new AppError("مقدار اعتبار باید عدد صحیح مثبت باشد");
  return prisma.$transaction(async (tx) => {
    const account = await tx.creditAccount.upsert({
      where: { id: GLOBAL_CREDIT_ACCOUNT_ID },
      create: { id: GLOBAL_CREDIT_ACCOUNT_ID },
      update: {},
    });
    await tx.creditAccount.update({
      where: { id: GLOBAL_CREDIT_ACCOUNT_ID },
      data: { balance: { increment: amount } },
    });
    await tx.creditTransaction.create({
      data: { amount, type: "DEPOSIT", description: description || "افزایش اعتبار", accountId: account.id },
    });
    return tx.creditAccount.findUniqueOrThrow({ where: { id: GLOBAL_CREDIT_ACCOUNT_ID } });
  });
}

