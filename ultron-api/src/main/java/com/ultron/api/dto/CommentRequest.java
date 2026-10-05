package com.ultron.api.dto;

import lombok.*;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class CommentRequest {
    private String author;
    private String content;
}
