"use server";

import { cookies } from "next/headers";
import { nanoid } from "nanoid";
import {
  getDocs,
  collection,
  query,
  where,
  serverTimestamp,
  doc,
  runTransaction,
} from "firebase/firestore";
import { revalidatePath } from "next/cache";
import { database } from "@/lib/firebase";
import { generateId } from "@/lib/utils";
import { AlertMessageType } from "@/lib/sharedTypes";

export async function AddToCartAction({
  id,
  size,
  color,
}: {
  id: string;
  size: string;
  color: string;
}) {
  const generateNewCart = async () => {
    try {
      const newDeviceIdentifier = nanoid();

      cookies().set({
        name: "device_identifier",
        value: newDeviceIdentifier,
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/",
        maxAge: 30 * 24 * 60 * 60, // expires in 30 days
      });

      const newCartData = {
        device_identifier: newDeviceIdentifier,
        products: [{ id, size, color }],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const newCartDocRef = doc(collection(database, "carts"), generateId());

      await runTransaction(database, async (transaction) => {
        transaction.set(newCartDocRef, newCartData);
      });

      revalidatePath("/");
      revalidatePath("/[slug]", "page");

      return {
        type: AlertMessageType.SUCCESS,
        message: "Item added to cart",
      };
    } catch (error) {
      console.error("Error generating new cart:", error);
      return {
        type: AlertMessageType.ERROR,
        message: "Please reload the page and try again",
      };
    }
  };

  const deviceIdentifier = cookies().get("device_identifier")?.value;

  if (!deviceIdentifier) {
    return await generateNewCart();
  }

  try {
    const collectionRef = collection(database, "carts");
    const snapshot = await getDocs(
      query(collectionRef, where("device_identifier", "==", deviceIdentifier))
    );

    if (snapshot.empty) {
      // If cart not found, generate a new one
      return await generateNewCart();
    } else {
      // If cart found, check if the product is already in the cart
      const cartDoc = snapshot.docs[0].ref;
      const existingProducts = snapshot.docs[0].data().products;

      const existingProductIndex = existingProducts.findIndex(
        (product: { id: string; size: string; color: string }) =>
          product.id === id
      );

      if (existingProductIndex !== -1) {
        // Product already in cart, update its size and color
        existingProducts[existingProductIndex] = { id, size, color };
      } else {
        // Product not in cart, add it to the existing products
        existingProducts.push({ id, size, color });
      }

      await runTransaction(database, async (transaction) => {
        transaction.update(cartDoc, {
          products: existingProducts,
          updatedAt: serverTimestamp(),
        });
      });

      revalidatePath("/");
      revalidatePath("/[slug]", "page");

      return {
        type: AlertMessageType.SUCCESS,
        message: "Item added to cart",
      };
    }
  } catch (error) {
    console.error("Error adding product to cart:", error);
    return {
      type: AlertMessageType.ERROR,
      message: "Please reload the page and try again",
    };
  }
}
