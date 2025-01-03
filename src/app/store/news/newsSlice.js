import { createSlice } from "@reduxjs/toolkit";
import { PayloadAction } from "@reduxjs/toolkit";

const initialState = {
    value: [
        {
            id: 1,
            version: "v1.0",
            title: "Мы открылись",
            imageSrc:
                "https://i.postimg.cc/DzLfkYFQ/2017-Nature-Beautiful-clouds-reflected-in-the-blue-water-of-the-ocean-115872.jpg",
            text: `Lorem ipsum odor amet, consectetuer adipiscing elit. Natoque nec elit cras enim porttitor facilisi magnis quam metus. Vel et facilisi faucibus aliquam imperdiet. Mollis efficitur magna malesuada primis duis. Semper dictum torquent ac duis felis quam. Elementum odio mauris at etiam tempor. Eros porta est habitant vel duis mus felis. Augue proin vehicula curabitur vehicula lectus fringilla dui maecenas. Aliquam vehicula quisque sit facilisi commodo nostra.

Per ridiculus molestie hendrerit purus eleifend neque tempus. Nostra dapibus leo erat nisl augue odio. Proin nisl mollis porttitor adipiscing integer semper. Vel malesuada elit orci nulla, maecenas mi porta sed. Tincidunt magna justo litora vel potenti eleifend. Molestie vehicula facilisi consectetur id metus sapien vivamus habitasse lectus. Hendrerit feugiat aenean praesent faucibus posuere pellentesque est eget molestie.

Sodales ultricies condimentum fermentum odio magna maecenas. Diam maximus luctus nullam suscipit congue; egestas eros curae dui. Parturient ullamcorper dictum nam urna nisi lectus. Et lacinia platea volutpat pretium ullamcorper. Velit a semper interdum diam orci finibus adipiscing dictum. Sed magnis suspendisse duis nibh proin adipiscing nunc. Inceptos aenean ut luctus inceptos ultrices egestas adipiscing convallis nibh.`,
        },
        {
            id: 2,
            version: "v1.1",
            title: "Мы прокачались",
            imageSrc:
                "https://i.postimg.cc/g0dQjM8H/babd6d37eb2dd965c7f1dfb516d54094.jpg",
            text: `Lorem ipsum odor amet, consectetuer adipiscing elit. Natoque nec elit cras enim porttitor facilisi magnis quam metus. Vel et facilisi faucibus aliquam imperdiet. Mollis efficitur magna malesuada primis duis. Semper dictum torquent ac duis felis quam. Elementum odio mauris at etiam tempor. Eros porta est habitant vel duis mus felis. Augue proin vehicula curabitur vehicula lectus fringilla dui maecenas. Aliquam vehicula quisque sit facilisi commodo nostra.

Per ridiculus molestie hendrerit purus eleifend neque tempus. Nostra dapibus leo erat nisl augue odio. Proin nisl mollis porttitor adipiscing integer semper. Vel malesuada elit orci nulla, maecenas mi porta sed. Tincidunt magna justo litora vel potenti eleifend. Molestie vehicula facilisi consectetur id metus sapien vivamus habitasse lectus. Hendrerit feugiat aenean praesent faucibus posuere pellentesque est eget molestie.

Sodales ultricies condimentum fermentum odio magna maecenas. Diam maximus luctus nullam suscipit congue; egestas eros curae dui. Parturient ullamcorper dictum nam urna nisi lectus. Et lacinia platea volutpat pretium ullamcorper. Velit a semper interdum diam orci finibus adipiscing dictum. Sed magnis suspendisse duis nibh proin adipiscing nunc. Inceptos aenean ut luctus inceptos ultrices egestas adipiscing convallis nibh.`,
        },
        {
            id: 3,
            version: "v1.2",
            title: "Мы Веном",
            imageSrc: "https://i.postimg.cc/t4BV2Htb/i.webp",
            text: `Lorem ipsum odor amet, consectetuer adipiscing elit. Natoque nec elit cras enim porttitor facilisi magnis quam metus. Vel et facilisi faucibus aliquam imperdiet. Mollis efficitur magna malesuada primis duis. Semper dictum torquent ac duis felis quam. Elementum odio mauris at etiam tempor. Eros porta est habitant vel duis mus felis. Augue proin vehicula curabitur vehicula lectus fringilla dui maecenas. Aliquam vehicula quisque sit facilisi commodo nostra.

Per ridiculus molestie hendrerit purus eleifend neque tempus. Nostra dapibus leo erat nisl augue odio. Proin nisl mollis porttitor adipiscing integer semper. Vel malesuada elit orci nulla, maecenas mi porta sed. Tincidunt magna justo litora vel potenti eleifend. Molestie vehicula facilisi consectetur id metus sapien vivamus habitasse lectus. Hendrerit feugiat aenean praesent faucibus posuere pellentesque est eget molestie.

Sodales ultricies condimentum fermentum odio magna maecenas. Diam maximus luctus nullam suscipit congue; egestas eros curae dui. Parturient ullamcorper dictum nam urna nisi lectus. Et lacinia platea volutpat pretium ullamcorper. Velit a semper interdum diam orci finibus adipiscing dictum. Sed magnis suspendisse duis nibh proin adipiscing nunc. Inceptos aenean ut luctus inceptos ultrices egestas adipiscing convallis nibh.`,
        },
    ],
};

export const newsSlice = createSlice({
    name: "news",
    initialState,
    reducers: {},
});

export const {} = newsSlice.actions;

export default newsSlice.reducer;
