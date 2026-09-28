; Picked up automatically by electron-builder.
; Removes the login item Atem registered for itself (value name = AppUserModelId).
!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ch.chriggi.atem"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "ch.chriggi.atem"
!macroend
