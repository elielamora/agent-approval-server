class ClaudeApprovalServer < Formula
  desc "Approval server for Claude Code hooks"
  homepage "https://github.com/wagenet/claude-approval-server"
  version "1.4.0"

  on_arm do
    url "https://github.com/wagenet/claude-approval-server/releases/download/v1.4.0/claude-approval-server-macos-arm64"
    sha256 "4ac991196da346a39b4a731dd7d9c1772df04b68fc46f9018a7a578cb92c73c8"
  end

  on_intel do
    url "https://github.com/wagenet/claude-approval-server/releases/download/v1.4.0/claude-approval-server-macos-x86_64"
    sha256 "d3f09f2b8c03ab44cc062b17c5687bfa4931beacaf82f6ec93697e6e58ba0ddd"
  end

  def install
    bin.install "claude-approval-server-macos-arm64" => "claude-approval-server" if Hardware::CPU.arm?
    bin.install "claude-approval-server-macos-x86_64" => "claude-approval-server" if Hardware::CPU.intel?
  end

  service do
    run [opt_bin/"claude-approval-server", "serve"]
    keep_alive true
    log_path "/tmp/claude-approval.log"
    error_log_path "/tmp/claude-approval.error.log"
    environment_variables HOME: ENV["HOME"]
  end

  def caveats
    <<~EOS
      Run the following to configure Claude Code hooks:
        claude-approval-server install-hooks

      To remove hooks before uninstalling:
        claude-approval-server uninstall

      Restart Claude Code for hook changes to take effect.
    EOS
  end
end
