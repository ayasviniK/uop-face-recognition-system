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
        if (adminRepository.count() == 0) {
            String adminUser = System.getenv("ADMIN_USERNAME");
            if (adminUser == null || adminUser.trim().isEmpty()) {
                adminUser = "admin";
            }
            String adminPass = System.getenv("ADMIN_PASSWORD");
            boolean generated = false;
            if (adminPass == null || adminPass.trim().isEmpty()) {
                adminPass = java.util.UUID.randomUUID().toString();
                generated = true;
            }
            Admin defaultAdmin = Admin.builder()
                    .username(adminUser)
                    .password(passwordEncoder.encode(adminPass))
                    .build();
            adminRepository.save(defaultAdmin);
            if (generated) {
                log.info("--------------------------------------------------");
                log.info("No ADMIN_PASSWORD env variable set. Generated secure random admin credentials:");
                log.info("Username: {}", adminUser);
                log.info("Password: {}", adminPass);
                log.info("--------------------------------------------------");
            } else {
                log.info("Administrator seeded successfully with configured credentials: {}", adminUser);
            }
        }
    }
}
