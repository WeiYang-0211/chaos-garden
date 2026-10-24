# 字体来源与版权

本项目只分发服务端使用的字体文件，不把字体文件发送到浏览器。所有字体均采用 **SIL Open Font License 1.1**，完整协议文本见同目录 `OFL-1.1.txt`。

| 文件 | 字体 | 项目 / 作者 | 来源 |
| --- | --- | --- | --- |
| `Xiaolai-Regular.ttf` | 小赖字体 | 小赖 / lxgw 镜像维护 | https://github.com/lxgw/kose-font |
| `Yozai-Regular.ttf` | 悠哉字体 | lxgw | https://github.com/lxgw/yozai-font |
| `MaShanZheng-Regular.ttf` | Ma Shan Zheng / 马善政毛笔楷书 | The Ma Shan Zheng Project Authors | https://fonts.google.com/specimen/Ma+Shan+Zheng |
| `ZhiMangXing-Regular.ttf` | Zhi Mang Xing / 志莽行书 | The Zhi Mang Xing Project Authors | https://fonts.google.com/specimen/Zhi+Mang+Xing |
| `LongCang-Regular.ttf` | Long Cang / 龙藏体 | The Long Cang Project Authors | https://fonts.google.com/specimen/Long+Cang |
| `LiuJianMaoCao-Regular.ttf` | Liu Jian Mao Cao / 刘建毛草 | The Liu Jian Mao Cao Project Authors | https://fonts.google.com/specimen/Liu+Jian+Mao+Cao |
| `ChenYuluoyan-2.0-Thin.ttf` | 辰宇落雁体 | 韦辰 / 陈宇（Chenyu-otf） | https://github.com/Chenyu-otf/chenyuluoyan_thin |
| `LXGWWenKai-Regular.ttf` | 霞鹜文楷 | LXGW | https://github.com/lxgw/LxgwWenKai |

## 关于辰宇落雁体

原版 TTF 的 TrueType hinting 在 FreeType 下会报 `too many function definitions`。仓库中的字体移除了 `fpgm`、`prep`、`cvt `、`gasp`、`DSIG` 表，只保留字形轮廓和必要表，字形设计未改动。这是 OFL 1.1 允许的修改；修改版仍按 OFL 1.1 分发。

## 纸张与桌面

本项目的纸张、木纹、装订孔、阴影、污渍等均由 Python + Pillow + NumPy 程序化生成，不包含原站（autohanding.com）的图片素材。
