// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CertificateRegistry
/// @notice On-chain registry of academic certificates issued by a university.
/// @dev Only the owner or accounts approved as admins can issue/revoke certificates.
///      Anyone can read and verify a certificate (read functions are `view`).
contract CertificateRegistry {
    // ------------------------------------------------------------------
    // Types & storage
    // ------------------------------------------------------------------
    struct Certificate {
        string studentName;
        string studentId; // CNE / internal id
        string diplomaTitle;
        string issueDate; // ISO format, e.g. 2026-06-15
        string grade;
        address recipient; // optional: address(0) when the student has no wallet
        bool revoked;
    }

    /// @dev Hard cap per batch, protects against out-of-gas transactions.
    uint256 public constant MAX_BATCH_SIZE = 50;

    address public owner;
    mapping(address => bool) public admins;

    /// @notice Number of certificates issued so far (ids go from 1 to totalCertificates).
    uint256 public totalCertificates;

    mapping(uint256 => Certificate) private _certificates;
    /// @dev keccak256(studentId, diplomaTitle) => certId (0 = not registered)
    mapping(bytes32 => uint256) private _certIdByKey;

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------
    event CertificateMinted(
        uint256 indexed certId,
        address indexed recipient,
        string studentId,
        string diplomaTitle
    );
    event CertificateRevoked(uint256 indexed certId, address indexed revokedBy);
    event AdminUpdated(address indexed account, bool isAdmin);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ------------------------------------------------------------------
    // Errors
    // ------------------------------------------------------------------
    error NotOwner();
    error NotAdmin();
    error EmptyField(string field);
    error DuplicateCertificate(uint256 existingCertId);
    error CertificateNotFound(uint256 certId);
    error AlreadyRevoked(uint256 certId);
    error ArrayLengthMismatch();
    error EmptyBatch();
    error BatchTooLarge(uint256 size, uint256 max);
    error ZeroAddress();

    // ------------------------------------------------------------------
    // Access control
    // ------------------------------------------------------------------
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAdmin() {
        if (msg.sender != owner && !admins[msg.sender]) revert NotAdmin();
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function setAdmin(address account, bool isAdmin_) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        admins[account] = isAdmin_;
        emit AdminUpdated(account, isAdmin_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice True if `account` may issue and revoke certificates.
    function isAdmin(address account) public view returns (bool) {
        return account == owner || admins[account];
    }

    // ------------------------------------------------------------------
    // Issuing
    // ------------------------------------------------------------------

    /// @notice Issue one certificate.
    function mintCertificate(
        address to,
        string calldata studentName,
        string calldata studentId,
        string calldata diplomaTitle,
        string calldata issueDate,
        string calldata grade
    ) external onlyAdmin returns (uint256 certId) {
        certId = _mint(to, studentName, studentId, diplomaTitle, issueDate, grade);
    }

    /// @notice Issue several certificates in one transaction (all-or-nothing).
    /// @dev Recommended size: 5 to 15 per transaction. Hard limit: MAX_BATCH_SIZE.
    function batchMint(
        address[] calldata recipients,
        string[] calldata studentNames,
        string[] calldata studentIds,
        string[] calldata diplomaTitles,
        string[] calldata issueDates,
        string[] calldata grades
    ) external onlyAdmin {
        uint256 n = recipients.length;
        if (n == 0) revert EmptyBatch();
        if (n > MAX_BATCH_SIZE) revert BatchTooLarge(n, MAX_BATCH_SIZE);
        if (
            studentNames.length != n ||
            studentIds.length != n ||
            diplomaTitles.length != n ||
            issueDates.length != n ||
            grades.length != n
        ) revert ArrayLengthMismatch();

        for (uint256 i = 0; i < n; i++) {
            _mint(
                recipients[i],
                studentNames[i],
                studentIds[i],
                diplomaTitles[i],
                issueDates[i],
                grades[i]
            );
        }
    }

    function _mint(
        address to,
        string calldata studentName,
        string calldata studentId,
        string calldata diplomaTitle,
        string calldata issueDate,
        string calldata grade
    ) internal returns (uint256 certId) {
        if (bytes(studentName).length == 0) revert EmptyField("studentName");
        if (bytes(studentId).length == 0) revert EmptyField("studentId");
        if (bytes(diplomaTitle).length == 0) revert EmptyField("diplomaTitle");
        if (bytes(issueDate).length == 0) revert EmptyField("issueDate");

        // One student can hold several diplomas (Licence, then Master...),
        // but never the same diploma twice.
        bytes32 key = keccak256(abi.encode(studentId, diplomaTitle));
        uint256 existing = _certIdByKey[key];
        if (existing != 0) revert DuplicateCertificate(existing);

        certId = ++totalCertificates;
        _certIdByKey[key] = certId;

        _certificates[certId] = Certificate({
            studentName: studentName,
            studentId: studentId,
            diplomaTitle: diplomaTitle,
            issueDate: issueDate,
            grade: grade,
            recipient: to,
            revoked: false
        });

        emit CertificateMinted(certId, to, studentId, diplomaTitle);
    }

    // ------------------------------------------------------------------
    // Revocation
    // ------------------------------------------------------------------
    function revoke(uint256 certId) external onlyAdmin {
        _requireExists(certId);
        Certificate storage c = _certificates[certId];
        if (c.revoked) revert AlreadyRevoked(certId);
        c.revoked = true;
        emit CertificateRevoked(certId, msg.sender);
    }

    // ------------------------------------------------------------------
    // Public reads (free, no transaction needed)
    // ------------------------------------------------------------------
    function getCertificate(uint256 certId) external view returns (Certificate memory) {
        _requireExists(certId);
        return _certificates[certId];
    }

    /// @notice True if the certificate exists and has not been revoked.
    function isValid(uint256 certId) external view returns (bool) {
        if (certId == 0 || certId > totalCertificates) return false;
        return !_certificates[certId].revoked;
    }

    /// @notice Find a certificate id from a student id + diploma title (0 if none).
    function findCertificateId(
        string calldata studentId,
        string calldata diplomaTitle
    ) external view returns (uint256) {
        return _certIdByKey[keccak256(abi.encode(studentId, diplomaTitle))];
    }

    function _requireExists(uint256 certId) internal view {
        if (certId == 0 || certId > totalCertificates) revert CertificateNotFound(certId);
    }
}
