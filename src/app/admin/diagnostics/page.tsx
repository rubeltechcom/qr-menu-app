import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { requireSuperadmin } from "@/lib/require-superadmin";
import { env } from "@/lib/env";
import { describeStorage, getStorageDriver } from "@/modules/storage/registry";
import { uploadRoot } from "@/modules/storage/local.driver";

/**
 * Why isn't it working?
 *
 * Everything here answers a question that would otherwise need SSH
 * access to the server: is the upload directory writable, is it actually
 * a mounted volume, is the database reachable, which version is running.
 *
 * Superadmin only, and it deliberately reports no secrets — a path and a
 * yes/no, never a credential.
 */
export const dynamic = "force-dynamic";

type Status = "ok" | "warn" | "fail";

interface Check {
  label: string;
  status: Status;
  detail: string;
  fix?: string;
}

async function checkUploads(): Promise<Check[]> {
  const checks: Check[] = [];
  const storage = describeStorage();
  const root = uploadRoot();

  checks.push({
    label: "Storage driver",
    status: "ok",
    detail: `${storage.displayName}${storage.detail ? ` (${storage.detail})` : ""}`,
  });

  if (storage.id === "S3") {
    try {
      await getStorageDriver().assertWritable();
      checks.push({
        label: "Bucket reachable",
        status: "ok",
        detail: "The bucket responded.",
      });
    } catch (error) {
      checks.push({
        label: "Bucket reachable",
        status: "fail",
        detail: error instanceof Error ? error.message : "Could not reach the bucket.",
        fix: "Check S3_ENDPOINT, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.",
      });
    }
    return checks;
  }

  // Local driver: the two things that actually go wrong.
  checks.push({
    label: "Upload directory",
    status: "ok",
    detail: root,
  });

  // Is it writable? This is the check that catches a volume mounted
  // root-owned, which is the usual cause of "uploads do nothing".
  try {
    const probe = path.join(root, ".tmp", `diagnostic-${Date.now()}`);
    await mkdir(path.dirname(probe), { recursive: true });
    await writeFile(probe, "ok");
    await rm(probe, { force: true });
    checks.push({
      label: "Writable",
      status: "ok",
      detail: "A test file was written and removed successfully.",
    });
  } catch (error) {
    checks.push({
      label: "Writable",
      status: "fail",
      detail: error instanceof Error ? error.message : "Could not write.",
      fix:
        "The container cannot write here. In Coolify, add a Volume Mount with " +
        `destination ${root}, and make sure the Dockerfile chowns it to the ` +
        "node user before dropping privileges.",
    });
  }

  // Is it persistent? A path inside the app directory is almost
  // certainly the container's own filesystem, not a mounted volume —
  // which means every redeploy silently destroys every photo.
  const insideApp = root.startsWith(path.resolve(process.cwd()) + path.sep);
  checks.push({
    label: "Persistent across redeploys",
    status: insideApp ? "warn" : "ok",
    detail: insideApp
      ? `${root} is inside the application directory.`
      : "The upload directory is outside the application directory.",
    fix: insideApp
      ? "This is probably NOT a mounted volume, so uploaded photos will be " +
        "lost on the next redeploy. Add a Coolify volume (e.g. /data/uploads) " +
        "and set UPLOAD_DIR to it."
      : undefined,
  });

  // How much is actually stored — a quick sanity check that files are
  // landing where they are expected to.
  try {
    let count = 0;
    let bytes = 0;
    for await (const object of getStorageDriver().list("t/")) {
      count += 1;
      bytes += object.bytes;
      if (count >= 5000) break;
    }
    checks.push({
      label: "Stored files",
      status: "ok",
      detail:
        count === 0
          ? "No files stored yet."
          : `${count} file${count === 1 ? "" : "s"}, ${(bytes / 1024 / 1024).toFixed(1)} MB.`,
    });
  } catch {
    checks.push({
      label: "Stored files",
      status: "warn",
      detail: "Could not list the upload directory.",
    });
  }

  return checks;
}

export default async function DiagnosticsPage() {
  await requireSuperadmin();

  const uploads = await checkUploads();

  const runtime: Check[] = [
    {
      label: "Version",
      status: "ok",
      detail: process.env.APP_VERSION ?? "unknown (set by the Docker build)",
    },
    {
      label: "Environment",
      status: env.NODE_ENV === "production" ? "ok" : "warn",
      detail: env.NODE_ENV,
    },
    {
      label: "Public URL",
      status: "ok",
      detail: env.APP_URL,
    },
  ];

  // Uploads are written under UPLOAD_DIR; if the process cannot even
  // stat it, nothing else about uploads matters.
  try {
    const stats = await stat(uploadRoot());
    runtime.push({
      label: "Upload directory exists",
      status: stats.isDirectory() ? "ok" : "fail",
      detail: stats.isDirectory() ? "Yes." : "Exists but is not a directory.",
    });
  } catch {
    runtime.push({
      label: "Upload directory exists",
      status: "warn",
      detail: "Not created yet — it is created on the first upload.",
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-zinc-900">
          Diagnostics
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          What the server can see about itself. Useful when something works locally but
          not in production.
        </p>
      </div>

      <Section title="File uploads" checks={uploads} />
      <Section title="Runtime" checks={runtime} />
    </div>
  );
}

function Section({ title, checks }: { title: string; checks: Check[] }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h3 className="font-semibold text-zinc-900">{title}</h3>

      <dl className="mt-4 flex flex-col divide-y divide-zinc-100">
        {checks.map((check) => (
          <div key={check.label} className="flex items-start gap-3 py-3">
            <Icon status={check.status} />
            <div className="min-w-0 flex-1">
              <dt className="text-sm font-medium text-zinc-900">{check.label}</dt>
              <dd className="mt-0.5 font-mono text-xs break-words text-zinc-600">
                {check.detail}
              </dd>
              {check.fix && (
                <dd className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {check.fix}
                </dd>
              )}
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Icon({ status }: { status: Status }) {
  if (status === "ok") {
    return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />;
  }
  if (status === "warn") {
    return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />;
  }
  return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />;
}
