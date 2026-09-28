; Picked up automatically by electron-builder.
; On a real uninstall, remove the login item Atem registered for itself (value name = AppUserModelId).
; During an update the old version is uninstalled first – then the entry must stay.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ch.chriggi.atem"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "ch.chriggi.atem"
  ${endIf}
!macroend
