param(
  [string]$Repository = 'immortal-life-source/immortal-life',
  [string]$RecoveryFile = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'immortal-life-recovery-key.txt')
)

$ErrorActionPreference = 'Stop'

if (-not ('CredentialReader' -as [type])) {
  Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class CredentialReader {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  private struct Credential {
    public UInt32 Flags;
    public UInt32 Type;
    public string TargetName;
    public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public UInt32 CredentialBlobSize;
    public IntPtr CredentialBlob;
    public UInt32 Persist;
    public UInt32 AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }

  [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern bool CredRead(string target, UInt32 type, UInt32 reservedFlag, out IntPtr credentialPtr);

  [DllImport("advapi32.dll", SetLastError = true)]
  private static extern void CredFree(IntPtr credentialPtr);

  public static string ReadGeneric(string target) {
    IntPtr pointer;
    if (!CredRead(target, 1, 0, out pointer)) {
      throw new InvalidOperationException("Windows Credential Manager does not contain " + target);
    }
    try {
      Credential credential = Marshal.PtrToStructure<Credential>(pointer);
      byte[] bytes = new byte[credential.CredentialBlobSize];
      Marshal.Copy(credential.CredentialBlob, bytes, 0, bytes.Length);
      string utf8 = Encoding.UTF8.GetString(bytes).TrimEnd('\0');
      if (utf8.StartsWith("sbp_")) return utf8;
      string unicode = Encoding.Unicode.GetString(bytes).TrimEnd('\0');
      if (unicode.StartsWith("sbp_")) return unicode;
      throw new InvalidOperationException("Stored Supabase credential has an unexpected format");
    }
    finally {
      CredFree(pointer);
    }
  }
}
'@
}

function Set-GitHubSecretFromMemory {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Value,
    [Parameter(Mandatory = $true)][string]$Repo,
    [Parameter(Mandatory = $true)][string]$GitHubToken
  )

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = 'gh'
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.ArgumentList.Add('secret')
  $startInfo.ArgumentList.Add('set')
  $startInfo.ArgumentList.Add($Name)
  $startInfo.ArgumentList.Add('--repo')
  $startInfo.ArgumentList.Add($Repo)
  $startInfo.Environment['GH_TOKEN'] = $GitHubToken

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  if (-not $process.Start()) { throw "Could not start GitHub CLI" }
  $process.StandardInput.Write($Value)
  $process.StandardInput.Close()
  $standardOutput = $process.StandardOutput.ReadToEnd()
  $standardError = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) {
    throw "GitHub rejected secret $Name`: $standardError$standardOutput"
  }
}

$supabaseToken = [CredentialReader]::ReadGeneric('Supabase CLI:supabase')
$githubToken = (& gh auth token --user immortal-life-source).Trim()
if ($githubToken.Length -lt 20) { throw 'Could not read the immortal-life-source GitHub token' }

if (Test-Path -LiteralPath $RecoveryFile) {
  $recoveryLine = Get-Content -LiteralPath $RecoveryFile | Where-Object { $_ -like 'BACKUP_ENCRYPTION_PASSPHRASE=*' } | Select-Object -First 1
  if (-not $recoveryLine) { throw "Existing recovery file has no encryption passphrase: $RecoveryFile" }
  $passphrase = $recoveryLine.Substring('BACKUP_ENCRYPTION_PASSPHRASE='.Length).Trim()
} else {
  $randomBytes = New-Object byte[] 48
  [Security.Cryptography.RandomNumberGenerator]::Fill($randomBytes)
  $passphrase = [Convert]::ToBase64String($randomBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')

  $recoveryDirectory = Split-Path -Parent $RecoveryFile
  [IO.Directory]::CreateDirectory($recoveryDirectory) | Out-Null
  $contents = @"
IMMORTAL.LIFE DATABASE RECOVERY KEY

Keep this file offline and private. Anyone with this value and a backup artifact can decrypt the database backup.

BACKUP_ENCRYPTION_PASSPHRASE=$passphrase
"@
  [IO.File]::WriteAllText($RecoveryFile, $contents, [Text.UTF8Encoding]::new($false))

  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $acl = [Security.AccessControl.FileSecurity]::new()
  $acl.SetAccessRuleProtection($true, $false)
  $rule = [Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', 'Allow')
  $acl.AddAccessRule($rule)
  Set-Acl -LiteralPath $RecoveryFile -AclObject $acl
}

if ($passphrase.Length -lt 43) { throw 'Recovery passphrase is unexpectedly short' }

Set-GitHubSecretFromMemory -Name 'SUPABASE_ACCESS_TOKEN' -Value $supabaseToken -Repo $Repository -GitHubToken $githubToken
Set-GitHubSecretFromMemory -Name 'BACKUP_ENCRYPTION_PASSPHRASE' -Value $passphrase -Repo $Repository -GitHubToken $githubToken

Write-Output 'Configured protected GitHub Actions secrets: SUPABASE_ACCESS_TOKEN, BACKUP_ENCRYPTION_PASSPHRASE'
Write-Output "Saved the offline recovery key with current-user-only permissions: $RecoveryFile"
