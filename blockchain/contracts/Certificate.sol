// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Certificate {

    struct Cert {
        string studentName;
        string course;
        string orgName;
        string ipfsHash;
        string fileHash;   // SHA-256 hash of the original PDF/file
        bool exists;
    }

    mapping(string => Cert) public certificates;

    event CertificateIssued(string indexed id, string fileHash);

    function issueCertificate(
        string memory _id,
        string memory _name,
        string memory _course,
        string memory _org,
        string memory _ipfsHash,
        string memory _fileHash
    ) public {
        require(!certificates[_id].exists, "Certificate already issued");

        certificates[_id] = Cert(
            _name,
            _course,
            _org,
            _ipfsHash,
            _fileHash,
            true
        );

        emit CertificateIssued(_id, _fileHash);
    }

    // --- NEW HACKATHON FEATURE: BATCH ISSUANCE ---
    function batchIssueCertificates(
        string[] memory _ids,
        string[] memory _names,
        string[] memory _courses,
        string[] memory _orgs,
        string[] memory _ipfsHashes,
        string[] memory _fileHashes
    ) public {
        require(
            _ids.length == _names.length &&
            _ids.length == _courses.length &&
            _ids.length == _orgs.length &&
            _ids.length == _ipfsHashes.length &&
            _ids.length == _fileHashes.length,
            "Array lengths must match"
        );

        for (uint i = 0; i < _ids.length; i++) {
            if (!certificates[_ids[i]].exists) {
                certificates[_ids[i]] = Cert(
                    _names[i],
                    _courses[i],
                    _orgs[i],
                    _ipfsHashes[i],
                    _fileHashes[i],
                    true
                );
                // We emit the event for each so indexers can still pick them up individually
                emit CertificateIssued(_ids[i], _fileHashes[i]);
            }
        }
    }

    function verifyCertificate(string memory _certId)
        public
        view
        returns (
            string memory studentName,
            string memory course,
            string memory orgName,
            string memory ipfsHash,
            string memory fileHash,
            bool exists
        )
    {
        Cert memory cert = certificates[_certId];
        return (
            cert.studentName,
            cert.course,
            cert.orgName,
            cert.ipfsHash,
            cert.fileHash,
            cert.exists
        );
    }
}
