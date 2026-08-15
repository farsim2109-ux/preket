"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Camera, Loader2, User } from "lucide-react";

export interface ProfileData {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

interface ProfileFormProps {
  email: string;
  initial: ProfileData;
}

export function ProfileForm({ email, initial }: ProfileFormProps) {
  const [username, setUsername] = useState(initial.username ?? "");
  const [displayName, setDisplayName] = useState(initial.display_name ?? "");
  const [bio, setBio] = useState(initial.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initial.avatar_url ?? "");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const supabase = createClient();

  async function handleAvatarUpload(file: File) {
    setUploading(true);
    setError("");
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${initial.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) {
        setError(uploadError.message);
        return;
      }

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setAvatarUrl(`${data.publicUrl}?t=${Date.now()}`);
    } catch {
      setError("Failed to upload avatar. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    const { error: rpcError } = await supabase.rpc("update_profile", {
      p_username: username || null,
      p_display_name: displayName || null,
      p_bio: bio || null,
      p_avatar_url: avatarUrl || null,
    });

    if (rpcError) {
      setError(rpcError.message.includes("profiles_username_key")
        ? "That username is already taken"
        : rpcError.message);
      setLoading(false);
      return;
    }

    setSuccess("Profile saved");
    setLoading(false);
    router.refresh();
  }

  const initials = (displayName || username || email).slice(0, 2).toUpperCase();

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400">{error}</div>
      )}
      {success && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-sm text-emerald-400">
          {success}
        </div>
      )}

      <div className="flex items-center gap-5">
        <div className="relative">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt="Avatar"
              className="h-24 w-24 rounded-full object-cover ring-2 ring-zinc-700"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-zinc-800 ring-2 ring-zinc-700 text-xl font-bold text-zinc-300">
              {initials}
            </div>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="absolute bottom-0 right-0 rounded-full bg-blue-600 p-2 text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleAvatarUpload(file);
            }}
          />
        </div>
        <div>
          <p className="font-semibold text-lg">{displayName || username || "Your profile"}</p>
          <p className="text-sm text-zinc-500">{email}</p>
          <p className="text-xs text-zinc-600 mt-1">JPG, PNG, WebP or GIF · max 5MB</p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-2">Username</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">@</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            placeholder="trader123"
            maxLength={24}
            className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] pl-8 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <p className="text-xs text-zinc-600 mt-1">3–24 characters · letters, numbers, underscore</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-2">Display name</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="How others see you"
          maxLength={50}
          className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-2">Bio</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tell the market a little about you..."
          maxLength={280}
          rows={3}
          className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <p className="text-xs text-zinc-600 mt-1 text-right">{bio.length}/280</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-2">Avatar URL (optional)</label>
        <input
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          placeholder="https://..."
          type="url"
          className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <User className="h-4 w-4" />}
        Save profile
      </button>
    </form>
  );
}
