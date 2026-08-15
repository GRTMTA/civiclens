import { useEffect, useRef, useState } from "react"
import { ArrowLeft, ImagePlus, Loader2, Trash2 } from "lucide-react"

import { Avatar } from "@/components/avatar"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { requestSignIn } from "./community-auth"
import { CommunityShell } from "./community-shell"
import {
  ACCEPTED_IMAGE_TYPES,
  AVATAR_BYTES_MAX,
  joinedLabel,
  validateImage,
  validateProfile,
  type CommunityProfile,
  type ProfileEdit,
  type SortOption,
} from "./community-contract"
import { PostCard } from "./post-card"
import { useCommunityProfile } from "./use-community"

const fieldLabelClass = "text-xs font-medium tracking-[0.04em] text-muted-foreground uppercase"

const textFieldClass =
  "w-full rounded-lg border border-border bg-input/60 px-3 py-2 text-sm text-foreground transition-colors duration-150 outline-none placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"

function ProfileSkeleton() {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start gap-4">
          <Skeleton className="size-20 rounded-full" />
          <div className="flex-1 space-y-2.5">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-full max-w-sm" />
          </div>
        </div>
      </div>
      <Skeleton className="h-24 w-full rounded-lg" />
    </div>
  )
}

/** Avatar upload, replacement, and removal. */
function AvatarControls({
  profile,
  onUpload,
  onRemove,
}: {
  profile: CommunityProfile
  onUpload: (file: File) => Promise<unknown>
  onRemove: () => Promise<unknown>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const choose = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    const invalid = validateImage(file, AVATAR_BYTES_MAX)
    if (invalid) {
      setError(invalid)
      return
    }
    setError(null)
    setBusy("upload")
    try {
      await onUpload(file)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your photo could not be uploaded.")
    } finally {
      setBusy(null)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const remove = async () => {
    setError(null)
    setBusy("remove")
    try {
      await onRemove()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your photo could not be removed.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-2">
      <p className={fieldLabelClass}>Profile photo</p>
      <div className="flex items-center gap-3">
        <Avatar
          name={profile.displayName}
          url={profile.avatarUrl}
          size="lg"
          label={`${profile.displayName}'s profile photo`}
        />
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          className="sr-only"
          id="profile-avatar"
          onChange={(event) => void choose(event.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={() => inputRef.current?.click()}
        >
          {busy === "upload" ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <ImagePlus aria-hidden="true" />
          )}
          {profile.avatarUrl ? "Replace photo" : "Upload photo"}
        </Button>
        {profile.avatarUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy !== null}
            onClick={() => void remove()}
          >
            {busy === "remove" ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 aria-hidden="true" />
            )}
            Remove
          </Button>
        )}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        JPEG, PNG, or WebP up to {Math.round(AVATAR_BYTES_MAX / (1024 * 1024))}MB.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

function EditProfileForm({
  profile,
  onSave,
  onCancel,
  onUploadAvatar,
  onRemoveAvatar,
}: {
  profile: CommunityProfile
  onSave: (edit: ProfileEdit) => Promise<unknown>
  onCancel: () => void
  onUploadAvatar: (file: File) => Promise<unknown>
  onRemoveAvatar: () => Promise<unknown>
}) {
  const [edit, setEdit] = useState<ProfileEdit>({
    displayName: profile.displayName,
    username: profile.username,
    bio: profile.bio,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const invalid = validateProfile(edit)
    if (invalid) {
      setError(invalid.message)
      document.getElementById(`profile-${invalid.field}`)?.focus()
      return
    }
    setError(null)
    setSaving(true)
    setSaved(false)
    try {
      await onSave(edit)
      setSaved(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your profile could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      id="account"
      aria-labelledby="edit-profile-heading"
      className="rounded-lg border border-border bg-card p-4 sm:p-5"
    >
      <h2 id="edit-profile-heading" className="text-base font-semibold">
        Edit profile
      </h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Your display name and photo appear on everything you post.
      </p>

      <div className="mt-4">
        <AvatarControls
          profile={profile}
          onUpload={onUploadAvatar}
          onRemove={onRemoveAvatar}
        />
      </div>

      <form onSubmit={submit} className="mt-5 space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="profile-displayName" className={fieldLabelClass}>
            Display name
          </label>
          <input
            id="profile-displayName"
            value={edit.displayName}
            onChange={(event) => setEdit({ ...edit, displayName: event.target.value })}
            maxLength={80}
            required
            className={cn(textFieldClass, "h-10")}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="profile-username" className={fieldLabelClass}>
            Username
          </label>
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="text-sm text-muted-foreground">
              @
            </span>
            <input
              id="profile-username"
              value={edit.username}
              onChange={(event) =>
                setEdit({ ...edit, username: event.target.value.toLowerCase() })
              }
              maxLength={20}
              required
              autoComplete="off"
              spellCheck={false}
              aria-describedby="profile-username-hint"
              className={cn(textFieldClass, "h-10")}
            />
          </div>
          <p id="profile-username-hint" className="text-xs leading-5 text-muted-foreground">
            3-20 characters, lowercase letters, numbers, or underscore. Must be unique.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="profile-bio" className={fieldLabelClass}>
            Bio
          </label>
          <textarea
            id="profile-bio"
            value={edit.bio}
            onChange={(event) => setEdit({ ...edit, bio: event.target.value })}
            maxLength={280}
            rows={3}
            placeholder="A short line about your interest in local infrastructure."
            className={cn(textFieldClass, "resize-y leading-6")}
          />
          <p className="text-right text-[0.7rem] text-muted-foreground tabular-nums">
            {edit.bio.trim().length}/280
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {saved && !error && (
          <p role="status" className="text-sm text-positive">
            Your profile has been saved.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="lg" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" size="lg" disabled={saving}>
            {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </section>
  )
}

function StatCounts({ profile }: { profile: CommunityProfile }) {
  const stats = [
    { label: profile.postCount === 1 ? "Post" : "Posts", value: profile.postCount },
    {
      label: profile.observationCount === 1 ? "Observation" : "Observations",
      value: profile.observationCount,
    },
    { label: profile.commentCount === 1 ? "Comment" : "Comments", value: profile.commentCount },
  ]

  return (
    <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 border-t border-border pt-3.5">
      {stats.map((stat) => (
        <div key={stat.label}>
          <dt className="text-xs text-muted-foreground">{stat.label}</dt>
          <dd className="text-sm font-semibold tabular-nums">{stat.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * `/community/profile/:username` — a resident's public profile.
 *
 * Readable by guests, editable only by the resident themselves. Everything here
 * is Resident content: a profile makes no claim about any Official-source record.
 */
export function ProfilePage({ username }: { username: string }) {
  const account = useCommunityProfile(username)
  // `?edit=1` comes from the header's account menu.
  const [editing, setEditing] = useState(
    () => new URLSearchParams(window.location.search).get("edit") === "1",
  )
  const [sort, setSort] = useState<SortOption>("new")

  const { profile } = account

  useEffect(() => {
    document.title = profile
      ? `${profile.displayName} — CivicLens Community`
      : "Profile — CivicLens Community"
  }, [profile])

  // Only the owner may edit, whatever the URL says.
  const canEdit = account.isOwner && editing

  return (
    <CommunityShell
      headerTitle="Community"
      sort={sort}
      onSortChange={(next) => {
        setSort(next)
        window.location.assign(`/community?sort=${next}`)
      }}
      topic={null}
      onTopicChange={(next) =>
        window.location.assign(next ? `/community?topic=${next}` : "/community")
      }
      viewer={account.viewer}
      viewerReady={account.viewerReady}
      onSignOut={account.signOut}
    >
      <div className="mx-auto min-w-0 max-w-3xl space-y-3">
        <Button variant="ghost" size="sm" className="-ml-1 text-muted-foreground" asChild>
          <a href="/community">
            <ArrowLeft aria-hidden="true" />
            Back to Community
          </a>
        </Button>

        {account.error && (
          <p
            role="alert"
            className={
              account.state === "unconfigured"
                ? "rounded-lg border border-warning/35 bg-warning/10 px-4 py-3 text-sm text-warning"
                : "rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            }
          >
            {account.error}
          </p>
        )}

        {account.state === "loading" ? (
          <ProfileSkeleton />
        ) : account.state === "unconfigured" ? null : !profile ? (
          <div className="rounded-lg border border-dashed border-border bg-card px-6 py-14 text-center">
            <h2 className="text-base font-semibold">This profile is not available</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              No resident with the handle @{username} was found.
            </p>
            <Button variant="outline" size="lg" className="mt-4" asChild>
              <a href="/community">Back to Community</a>
            </Button>
          </div>
        ) : (
          <>
            <section
              aria-labelledby="profile-heading"
              className="rounded-lg border border-border bg-card p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start gap-4">
                <Avatar
                  name={profile.displayName}
                  url={profile.avatarUrl}
                  size="xl"
                  label={`${profile.displayName}'s profile photo`}
                />
                <div className="min-w-0 flex-1">
                  <h1 id="profile-heading" className="text-lg font-semibold tracking-[-0.01em]">
                    {profile.displayName}
                  </h1>
                  <p className="text-sm text-muted-foreground">@{profile.username}</p>
                  {profile.bio && (
                    <p className="mt-2.5 text-sm leading-6 text-foreground/85">{profile.bio}</p>
                  )}
                  {profile.joinedAt && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Joined {joinedLabel(profile.joinedAt)}
                    </p>
                  )}
                </div>
                {account.isOwner && !editing && (
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                    Edit profile
                  </Button>
                )}
              </div>

              <StatCounts profile={profile} />
            </section>

            {canEdit && (
              <EditProfileForm
                profile={profile}
                onSave={account.save}
                onCancel={() => setEditing(false)}
                onUploadAvatar={account.uploadAvatar}
                onRemoveAvatar={account.removeAvatar}
              />
            )}

            <section aria-labelledby="profile-activity-heading" className="space-y-2.5">
              <h2
                id="profile-activity-heading"
                className="text-[0.7rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase"
              >
                Community activity
              </h2>
              {account.posts.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
                  {profile.displayName} has not posted yet.
                </p>
              ) : (
                account.posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    // Voting from a profile is not offered; the discussion is
                    // where a resident responds.
                    onVote={() => {
                      if (!account.viewer && account.viewerReady) requestSignIn()
                    }}
                    canInteract={Boolean(account.viewer)}
                  />
                ))
              )}
            </section>
          </>
        )}
      </div>
    </CommunityShell>
  )
}
