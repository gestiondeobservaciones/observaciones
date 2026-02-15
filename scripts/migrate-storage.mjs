import { createClient } from "@supabase/supabase-js";

const src = createClient(process.env.SRC_URL, process.env.SRC_SERVICE_ROLE, {
  auth: { persistSession: false },
});
const dst = createClient(process.env.DST_URL, process.env.DST_SERVICE_ROLE, {
  auth: { persistSession: false },
});

async function listAllFiles(client, bucket, prefix = "") {
  const found = [];
  let offset = 0;

  while (true) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    if (!data?.length) break;

    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) {
        found.push(path);
      } else {
        found.push(...(await listAllFiles(client, bucket, path)));
      }
    }

    if (data.length < 100) break;
    offset += 100;
  }

  return found;
}

async function ensureBucket(bucket) {
  const { data: existing, error } = await dst.storage.getBucket(bucket.name);
  if (!error && existing) return;

  const { error: createError } = await dst.storage.createBucket(bucket.name, {
    public: bucket.public,
    fileSizeLimit: bucket.file_size_limit ?? undefined,
    allowedMimeTypes: bucket.allowed_mime_types ?? undefined,
  });
  if (createError && !String(createError.message).includes("already exists")) {
    throw createError;
  }
}

async function main() {
  const required = [
    "SRC_URL",
    "DST_URL",
    "SRC_SERVICE_ROLE",
    "DST_SERVICE_ROLE",
  ];
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing env var: ${key}`);
  }

  const { data: buckets, error } = await src.storage.listBuckets();
  if (error) throw error;

  for (const bucket of buckets) {
    await ensureBucket(bucket);
    const files = await listAllFiles(src, bucket.name);
    console.log(`Bucket ${bucket.name}: ${files.length} file(s)`);

    for (const path of files) {
      const { data: blob, error: downloadError } = await src.storage
        .from(bucket.name)
        .download(path);
      if (downloadError) throw downloadError;

      const { error: uploadError } = await dst.storage
        .from(bucket.name)
        .upload(path, blob, { upsert: true });
      if (uploadError) throw uploadError;

      console.log(`  [OK] ${path}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
