
require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const mongoose = require("mongoose");

async function migrateUrls() {
  const oldHost = "https://botique-backend-k8f1.onrender.com";
  const newHost = process.env.BASE_URL;
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri || !newHost) {
    throw new Error("Check MONGODB_URI and BASE_URL in .env");
  }

  await mongoose.connect(mongoUri);

  try {
    const collection = mongoose.connection.db.collection("products");
    const docs = await collection.find({}).toArray();
    let updated = 0;

    function replaceUrls(value) {
      if (typeof value === "string") {
        return value.replaceAll(oldHost, newHost);
      }

      if (Array.isArray(value)) {
        return value.map(replaceUrls);
      }

      if (
        value &&
        typeof value === "object" &&
        !(value instanceof Date) &&
        !value._bsontype
      ) {
        for (const key of Object.keys(value)) {
          value[key] = replaceUrls(value[key]);
        }
      }

      return value;
    }

    for (const doc of docs) {
      const before = JSON.stringify(doc);
      const changed = replaceUrls(doc);

      if (JSON.stringify(changed) !== before) {
        const { _id, ...fields } = changed;
        const result = await collection.updateOne(
          { _id },
          { $set: fields }
        );

        updated += result.modifiedCount;
        console.log("Updated product:", _id.toString());
      }
    }

    console.log("Products checked:", docs.length);
    console.log("Documents updated:", updated);
  } finally {
    await mongoose.disconnect();
  }
}

migrateUrls().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exitCode = 1;
});
