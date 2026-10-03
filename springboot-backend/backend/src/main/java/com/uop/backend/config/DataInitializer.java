package com.uop.backend.config;

import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import com.uop.backend.model.Admin;
import com.uop.backend.repository.AdminRepository;

import lombok.extern.slf4j.Slf4j;

@Component
@Slf4j
public class DataInitializer implements CommandLineRunner {

    private final AdminRepository adminRepository;
    private final PasswordEncoder passwordEncoder;

    public DataInitializer(AdminRepository adminRepository, PasswordEncoder passwordEncoder) {
        this.adminRepository = adminRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(String... args) throws Exception {
        String customAdminUser = System.getenv("ADMIN_USERNAME");
        String customAdminPass = System.getenv("ADMIN_PASSWORD");

        if (customAdminUser != null && !customAdminUser.trim().isEmpty()) {
            seedUserIfNotExists(customAdminUser, customAdminPass != null ? customAdminPass : "adminpassword");
        }
        seedUserIfNotExists("admin", customAdminPass != null ? customAdminPass : "adminpassword");
        seedUserIfNotExists("admin@uop.ac.lk", "admin123");
        seedUserIfNotExists("dean.eng@uop.ac.lk", "eng123");
        seedUserIfNotExists("dean.med@uop.ac.lk", "med123");
        seedUserIfNotExists("dean.sci@uop.ac.lk", "sci123");
        seedUserIfNotExists("dean.art@uop.ac.lk", "art123");
        seedUserIfNotExists("dean.ahs@uop.ac.lk", "ahs123");
        seedUserIfNotExists("dean.agr@uop.ac.lk", "agr123");
        seedUserIfNotExists("dean.mgt@uop.ac.lk", "mgt123");
        seedUserIfNotExists("dean.den@uop.ac.lk", "den123");
        seedUserIfNotExists("dean.vet@uop.ac.lk", "vet123");
    }

    private void seedUserIfNotExists(String username, String rawPassword) {
        if (!adminRepository.existsByUsername(username)) {
            adminRepository.save(Admin.builder()
                    .username(username)
                    .password(passwordEncoder.encode(rawPassword))
                    .build());
            log.info("Seeded user credentials for '{}'.", username);
        }
    }
}
