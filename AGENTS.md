<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Render the existing logo through BrandLogo, framing its shield without the obsolete embedded wordmark; this keeps branding consistent without replacing the source asset.
- Reuse MessageCopyButton for private and shared conversation messages so clipboard feedback and accessibility remain consistent.
- Persist validated device sessions and use local-scope sign-out so signing out on one device does not revoke other devices.
